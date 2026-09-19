-- =============================================================================
-- 0031 — Versements aux partenaires.
--
-- La ventilation est enregistrée à chaque encaissement depuis la migration
-- 0026, mais **rien ne part**. L'écran de revenus l'annonce en clair ; il
-- fallait bien finir par construire le chemin.
--
-- **Pourquoi un registre, et non un virement automatique.** Deux raisons, dont
-- une qui n'est pas de notre ressort :
--
-- 1. `/payouts` de FedaPay répond **403 « Opération non autorisée »** sur ce
--    compte : le droit d'émettre des virements demande un compte marchand
--    validé. Automatiser contre une API interdite serait écrire à l'aveugle.
-- 2. Le barème de commission n'est pas tranché. Verser automatiquement
--    figerait des montants calculés à un taux provisoire.
--
-- Le registre est donc la partie **certaine** : de quoi savoir ce qu'on doit,
-- le payer par les moyens du bord, et en garder la trace. L'automatisation s'y
-- branchera en remplaçant une seule fonction.
--
-- **`payments.payout_id` porte l'exactitude.** Un encaissement appartient à au
-- plus un versement ; « ce qui reste à verser » est donc une question à
-- laquelle la base répond, et non un calcul refait à chaque écran — c'est ce
-- qui empêche de payer deux fois le même encaissement.
-- =============================================================================

create type payout_method as enum ('mtn', 'moov', 'celtiis', 'virement');
create type payout_status as enum ('pending', 'sent', 'failed', 'cancelled');

-- -----------------------------------------------------------------------------
-- Où verser
--
-- Le nom du titulaire n'est pas une politesse : un numéro Mobile Money mal
-- recopié envoie l'argent chez quelqu'un d'autre, sans retour possible. Le nom
-- permet au moins de s'en apercevoir avant d'envoyer.
-- -----------------------------------------------------------------------------
create table payout_accounts (
  org_id uuid primary key references organizations (id) on delete cascade,
  method payout_method not null default 'mtn',
  -- Forme E.164, comme partout ailleurs (migration 0017).
  phone text,
  holder_name text not null,
  -- Coordonnées bancaires, pour un virement classique.
  bank_details text,

  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payout_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),

  -- Un moyen sans coordonnées ne sert à rien : soit un numéro, soit un RIB.
  constraint payout_has_coordinates
    check (method = 'virement' and bank_details is not null or method <> 'virement' and phone is not null)
);

-- -----------------------------------------------------------------------------
-- Les versements
-- -----------------------------------------------------------------------------
create table payouts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('VER'),

  org_id uuid not null references organizations (id) on delete restrict,
  amount bigint not null check (amount > 0),
  currency text not null default 'XOF',

  -- Coordonnées **figées** au moment du versement : le partenaire peut changer
  -- de numéro ensuite, la trace doit dire où l'argent est réellement parti.
  method payout_method not null,
  phone text,
  holder_name text not null,

  status payout_status not null default 'pending',
  -- Référence chez le prestataire, ou numéro de transaction Mobile Money saisi
  -- à la main quand le virement a été fait hors plateforme.
  provider_ref text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index payouts_org on payouts (org_id, created_at desc);
create index payouts_status on payouts (status, created_at);

-- Un encaissement appartient à au plus un versement. C'est cette colonne, et
-- elle seule, qui empêche de payer deux fois la même somme.
alter table payments
  add column payout_id uuid references payouts (id) on delete set null;

create index payments_awaiting_payout
  on payments (order_id)
  where status = 'paid' and payout_id is null;

-- -----------------------------------------------------------------------------
-- Le partenaire renseigne ses coordonnées
-- -----------------------------------------------------------------------------
create or replace function public.save_payout_account(
  org uuid,
  moyen public.payout_method,
  numero text,
  titulaire text,
  banque text default null
)
returns public.payout_accounts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.payout_accounts;
  canonique text;
begin
  if not app.is_org_member(org) then
    raise exception 'Vous n''appartenez pas à cette organisation.'
      using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(titulaire, '')) = '' then
    raise exception 'Indiquez le nom du titulaire du compte.' using errcode = 'check_violation';
  end if;

  canonique := case when moyen = 'virement' then null else app.canonical_phone(numero) end;

  if moyen <> 'virement' and (canonique is null or canonique !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Numéro de téléphone invalide.' using errcode = 'check_violation';
  end if;

  insert into public.payout_accounts (org_id, method, phone, holder_name, bank_details)
  values (org, moyen, canonique, btrim(titulaire), nullif(btrim(coalesce(banque, '')), ''))
  on conflict (org_id) do update
    set method = excluded.method,
        phone = excluded.phone,
        holder_name = excluded.holder_name,
        bank_details = excluded.bank_details,
        -- Changer de coordonnées annule la vérification : c'est tout l'intérêt
        -- de l'avoir vérifiée.
        verified_at = null,
        updated_at = now()
  returning * into ligne;

  perform app.log_event('payout_account', org, 'save', null, null,
    jsonb_build_object('method', moyen));

  return ligne;
end;
$$;

revoke execute on function public.save_payout_account(uuid, public.payout_method, text, text, text)
  from public, anon;
grant execute on function public.save_payout_account(uuid, public.payout_method, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Préparer un versement
--
-- Rassemble tout ce qui est encaissé et non encore versé pour une organisation.
-- Réservé à l'administration : décider qu'on paie est une décision, pas une
-- conséquence automatique d'un encaissement.
-- -----------------------------------------------------------------------------
create or replace function public.create_payout(org uuid)
returns public.payouts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  coords public.payout_accounts;
  total bigint;
  ligne public.payouts;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  select * into coords from public.payout_accounts where org_id = org;

  if coords.org_id is null then
    raise exception 'Ce partenaire n''a pas renseigné ses coordonnées de versement.'
      using errcode = 'no_data_found';
  end if;

  select coalesce(sum(p.partner_due), 0) into total
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.org_id = org and p.status = 'paid' and p.payout_id is null;

  if total <= 0 then
    raise exception 'Rien à verser à ce partenaire.' using errcode = 'check_violation';
  end if;

  insert into public.payouts (org_id, amount, method, phone, holder_name)
  values (org, total, coords.method, coords.phone, coords.holder_name)
  returning * into ligne;

  -- Rattachement dans la foulée : entre le calcul et l'écriture, un nouvel
  -- encaissement pourrait survenir et se retrouver payé sans être compté.
  update public.payments p
  set payout_id = ligne.id, updated_at = now()
  from public.orders o
  where o.id = p.order_id
    and o.org_id = org
    and p.status = 'paid'
    and p.payout_id is null;

  perform app.log_event('payout', ligne.id, 'create', null, 'pending',
    jsonb_build_object('org_id', org, 'amount', total));

  return ligne;
end;
$$;

revoke execute on function public.create_payout(uuid) from public, anon;
grant execute on function public.create_payout(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Enregistrer l'envoi
--
-- Tant que FedaPay refuse `/payouts`, le virement se fait par les moyens du
-- bord et se consigne ici. Quand le droit sera ouvert, seule cette fonction
-- aura à changer.
-- -----------------------------------------------------------------------------
create or replace function public.mark_payout_sent(cible uuid, ref text, commentaire text default null)
returns public.payouts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.payouts;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  update public.payouts
  set status = 'sent',
      provider_ref = nullif(btrim(coalesce(ref, '')), ''),
      note = nullif(btrim(coalesce(commentaire, '')), ''),
      sent_at = now(),
      updated_at = now()
  where id = cible and status = 'pending'
  returning * into ligne;

  if ligne.id is null then
    raise exception 'Versement introuvable, ou déjà envoyé.' using errcode = 'check_violation';
  end if;

  perform app.log_event('payout', ligne.id, 'send', 'pending', 'sent',
    jsonb_build_object('amount', ligne.amount, 'provider_ref', ligne.provider_ref));

  return ligne;
end;
$$;

revoke execute on function public.mark_payout_sent(uuid, text, text) from public, anon;
grant execute on function public.mark_payout_sent(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Annuler un versement préparé
--
-- Les encaissements rattachés redeviennent à verser : sans cela, une erreur de
-- préparation retiendrait l'argent d'un partenaire sans que rien ne le montre.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_payout(cible uuid, motif text default null)
returns public.payouts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.payouts;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  update public.payouts
  set status = 'cancelled', note = nullif(btrim(coalesce(motif, '')), ''), updated_at = now()
  where id = cible and status = 'pending'
  returning * into ligne;

  if ligne.id is null then
    raise exception 'Versement introuvable, ou déjà envoyé.' using errcode = 'check_violation';
  end if;

  update public.payments set payout_id = null, updated_at = now() where payout_id = cible;

  perform app.log_event('payout', ligne.id, 'cancel', 'pending', 'cancelled',
    jsonb_build_object('motif', motif));

  return ligne;
end;
$$;

revoke execute on function public.cancel_payout(uuid, text) from public, anon;
grant execute on function public.cancel_payout(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Un partenaire lit ses coordonnées et ses versements, jamais ceux des autres.
-- L'écriture passe par les fonctions.
-- -----------------------------------------------------------------------------
alter table payout_accounts enable row level security;
alter table payouts enable row level security;

grant select on payout_accounts to authenticated;
grant select on payouts to authenticated;

create policy payout_accounts_select on payout_accounts
  for select using (app.is_org_member(org_id) or app.is_admin());

create policy payouts_select on payouts
  for select using (app.is_org_member(org_id) or app.is_admin());
