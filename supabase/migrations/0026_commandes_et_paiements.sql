-- =============================================================================
-- 0026 — Commandes et paiements.
--
-- Jusqu'ici, un devis accepté n'aboutissait à rien : le tunnel d'appel d'offres
-- se terminait sur un état en base et un SMS. Cette migration lui donne une
-- suite — une commande, puis un encaissement.
--
-- Trois décisions actées, qui expliquent la forme :
--
-- 1. **L'acompte est réglé par le partenaire**, pas par la plateforme
--    (`partner_profiles.deposit_percent`). Un traiteur n'engage pas les mêmes
--    frais qu'un loueur de salle ; leur imposer le même taux serait arbitraire.
-- 2. **Pas de séquestre.** La part du partenaire lui est due dès
--    l'encaissement, commission déduite. La plateforme ne conserve pas les
--    fonds jusqu'à la prestation — c'est plus simple, et cela n'engage pas
--    ÉniEvent comme dépositaire.
-- 3. **Le taux de commission n'est pas tranché.** Il vit dans
--    `app.runtime_config`, avec dérogation possible par partenaire
--    (`commission_rate_override`, déjà présente depuis la migration 0002).
--    Rien n'est reversé automatiquement : la ventilation est enregistrée,
--    le virement viendra quand le barème sera décidé.
--
-- **Le montant n'est jamais fourni par le client.** `start_payment` le calcule
-- depuis la commande, elle-même figée à l'acceptation du devis. Un devis peut
-- être modifié ensuite ; une commande, jamais.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- L'acompte, au choix du partenaire
-- -----------------------------------------------------------------------------
alter table partner_profiles
  add column deposit_percent numeric(5, 2) not null default 30
    check (deposit_percent between 0 and 100);

comment on column partner_profiles.deposit_percent is
  'Part du total demandée à la réservation, en pourcentage. 100 = paiement intégral.';

-- Le partenaire règle son acompte lui-même : c'est une colonne de son profil,
-- pas un privilège. Les colonnes qui définissent un privilège restent hors
-- d'atteinte (migration 0021).
grant update (deposit_percent) on partner_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Barème de commission
--
-- Une valeur par défaut, dérogeable par partenaire. Elle n'est pas figée dans
-- le code : la changer ne demandera pas de migration.
-- -----------------------------------------------------------------------------
insert into app.runtime_config (key, value)
values ('commission_rate_default', '10')
on conflict (key) do nothing;

create or replace function app.commission_rate(org uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.commission_rate_override from public.partner_profiles p where p.org_id = org),
    (select c.value::numeric from app.runtime_config c where c.key = 'commission_rate_default'),
    10
  );
$$;

revoke execute on function app.commission_rate(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- États
-- -----------------------------------------------------------------------------
create type order_status as enum (
  'pending_payment',
  'deposit_paid',
  'paid',
  'cancelled',
  'refunded'
);

create type payment_purpose as enum ('deposit', 'balance', 'full');
create type payment_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');

-- -----------------------------------------------------------------------------
-- Commandes
--
-- Les montants sont **figés à la création**. Le devis reste modifiable par son
-- auteur ; recalculer une commande depuis lui exposerait à ce qu'un partenaire
-- change le prix après acceptation.
-- -----------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('CMD'),

  -- Une commande par devis : la contrainte d'unicité est ce qui empêche un
  -- second passage du déclencheur d'en créer une deuxième.
  quote_id uuid not null unique references quotes (id) on delete restrict,
  request_id uuid not null references quote_requests (id) on delete restrict,
  client_id uuid not null references profiles (id) on delete restrict,
  org_id uuid not null references organizations (id) on delete restrict,

  total bigint not null check (total >= 0),
  currency text not null default 'XOF',

  -- Recopiés depuis le profil du partenaire au moment de la commande : son
  -- taux peut changer ensuite, celui de cette commande ne doit pas.
  deposit_percent numeric(5, 2) not null check (deposit_percent between 0 and 100),
  deposit_amount bigint not null check (deposit_amount >= 0),
  commission_rate numeric(5, 2) not null check (commission_rate between 0 and 100),

  status order_status not null default 'pending_payment',
  event_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,

  constraint deposit_within_total check (deposit_amount <= total)
);

create index orders_client on orders (client_id, created_at desc);
create index orders_org on orders (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Paiements
--
-- Un paiement porte sa propre ventilation : la commission s'applique à ce qui
-- est réellement encaissé, pas au total de la commande. Un acompte payé puis
-- un solde jamais réglé ne doivent pas rendre à la plateforme une commission
-- sur de l'argent qu'elle n'a pas vu.
-- -----------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('PAY'),

  order_id uuid not null references orders (id) on delete restrict,
  purpose payment_purpose not null,

  amount bigint not null check (amount > 0),
  currency text not null default 'XOF',

  -- `commission + partner_due = amount`, garanti par contrainte : une
  -- ventilation qui ne retombe pas sur ses pieds est la première cause de
  -- litige, et elle ne se voit pas à la lecture du code.
  commission bigint not null check (commission >= 0),
  partner_due bigint not null check (partner_due >= 0),

  provider text not null default 'fedapay',
  -- Identifiant de la transaction chez le prestataire. Unique : c'est lui qui
  -- rend le webhook idempotent, un même événement pouvant être rejoué.
  provider_ref text,
  provider_status text,

  -- Posée par l'appelant : deux clics sur « Payer » ne doivent pas ouvrir deux
  -- transactions, donc deux débits possibles.
  idempotency_key text not null unique,

  status payment_status not null default 'pending',
  last_error text,
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,

  constraint split_is_exact check (commission + partner_due = amount)
);

create unique index payments_provider_ref
  on payments (provider, provider_ref)
  where provider_ref is not null;

-- Un seul paiement **abouti** par nature : on peut réessayer autant qu'on veut,
-- on ne peut pas encaisser deux fois le même acompte.
create unique index payments_one_paid_per_purpose
  on payments (order_id, purpose)
  where status = 'paid';

create index payments_order on payments (order_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Naissance de la commande
--
-- Sur la transition du devis vers `accepted`, et non dans `accept_quote` :
-- le déclencheur couvre tous les chemins, y compris celui de la validation
-- d'entreprise — même raison qu'au lot des notifications.
-- -----------------------------------------------------------------------------
create or replace function app.create_order_for_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  pct numeric;
  taux numeric;
  acompte bigint;
begin
  select r.id as request_id, r.requester_id as client_id, r.event_date as event_date
  into ctx
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  where i.id = new.item_id;

  select coalesce(p.deposit_percent, 30) into pct
  from public.partner_profiles p
  where p.org_id = new.org_id;

  pct := coalesce(pct, 30);
  taux := app.commission_rate(new.org_id);

  -- Arrondi au demi supérieur, comme `roundHalfUp` de `money.ts`. Le solde est
  -- toujours `total - acompte` : la somme retombe donc exactement sur le total,
  -- sans qu'aucun franc ne se perde dans l'arrondi.
  acompte := round(new.subtotal::numeric * pct / 100)::bigint;

  insert into public.orders (
    quote_id, request_id, client_id, org_id,
    total, currency, deposit_percent, deposit_amount, commission_rate, event_date
  )
  values (
    new.id, ctx.request_id, ctx.client_id, new.org_id,
    new.subtotal, new.currency, pct, acompte, taux, ctx.event_date
  )
  on conflict (quote_id) do nothing;

  return new;
end;
$$;

create trigger quotes_create_order
  after update of status on quotes
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function app.create_order_for_quote();

-- -----------------------------------------------------------------------------
-- Ouverture d'un paiement
--
-- **Le montant n'est pas un paramètre.** Il est déduit de la commande et de la
-- nature demandée. C'est la règle du `CLAUDE.md` : un webhook revérifie le
-- montant côté serveur, et il n'y a rien à revérifier si le client a pu le
-- choisir au départ.
-- -----------------------------------------------------------------------------
create or replace function public.start_payment(target uuid, nature public.payment_purpose, cle text)
returns public.payments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cmd public.orders;
  montant bigint;
  deja bigint;
  com bigint;
  ligne public.payments;
begin
  select * into cmd from public.orders where id = target;

  if cmd.id is null then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if cmd.client_id <> auth.uid() then
    raise exception 'Seul le client de cette commande peut la régler.'
      using errcode = 'insufficient_privilege';
  end if;

  if cmd.status not in ('pending_payment', 'deposit_paid') then
    raise exception 'Cette commande n''attend plus de paiement (état : %).', cmd.status
      using errcode = 'check_violation';
  end if;

  montant := case nature
    when 'deposit' then cmd.deposit_amount
    when 'full' then cmd.total
    when 'balance' then cmd.total - cmd.deposit_amount
  end;

  if montant is null or montant <= 0 then
    raise exception 'Rien à régler pour cette nature de paiement.' using errcode = 'check_violation';
  end if;

  -- Une nature déjà réglée ne se repaie pas. L'index partiel l'interdirait de
  -- toute façon, mais une erreur lisible vaut mieux qu'une violation d'index.
  select count(*) into deja
  from public.payments
  where order_id = target and purpose = nature and status = 'paid';

  if deja > 0 then
    raise exception 'Ce paiement a déjà été encaissé.' using errcode = 'unique_violation';
  end if;

  com := round(montant::numeric * cmd.commission_rate / 100)::bigint;

  insert into public.payments (order_id, purpose, amount, currency, commission, partner_due, idempotency_key)
  values (target, nature, montant, cmd.currency, com, montant - com, cle)
  -- Deux clics sur « Payer » retrouvent le paiement déjà ouvert plutôt que
  -- d'en créer un second, donc un second débit possible.
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into ligne;

  perform app.log_event('payment', ligne.id, 'start', null, 'pending',
    jsonb_build_object('order_id', target, 'purpose', nature, 'amount', montant));

  return ligne;
end;
$$;

revoke execute on function public.start_payment(uuid, public.payment_purpose, text) from public, anon;
grant execute on function public.start_payment(uuid, public.payment_purpose, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Dénouement d'un paiement
--
-- Appelée par le webhook **après relecture de la transaction chez le
-- prestataire** : le corps du webhook n'est qu'un signal, jamais une preuve.
-- Réservée à la clé de service, qui contourne déjà la RLS.
--
-- Idempotente : un événement rejoué retrouve le paiement déjà abouti et ne
-- change rien.
-- -----------------------------------------------------------------------------
create or replace function public.settle_payment(
  cle text,
  ref_prestataire text,
  etat_prestataire text,
  encaisse boolean,
  montant_constate bigint default null,
  detail text default null
)
returns public.payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  ligne public.payments;
  cmd public.orders;
begin
  select * into ligne from public.payments where idempotency_key = cle;

  if ligne.id is null then
    raise exception 'Paiement introuvable pour cette clé.' using errcode = 'no_data_found';
  end if;

  if ligne.status = 'paid' then
    return ligne; -- déjà dénoué : un événement rejoué ne change rien
  end if;

  -- Le montant constaté chez le prestataire doit correspondre à ce que nous
  -- avons ouvert. Un écart signale une transaction fabriquée, ou un paiement
  -- partiel : dans les deux cas, ne rien valider.
  if encaisse and montant_constate is not null and montant_constate <> ligne.amount then
    update public.payments
    set status = 'failed',
        provider_ref = ref_prestataire,
        provider_status = etat_prestataire,
        last_error = format('Montant constaté %s, attendu %s', montant_constate, ligne.amount),
        updated_at = now()
    where id = ligne.id
    returning * into ligne;

    perform app.log_event('payment', ligne.id, 'amount_mismatch', 'pending', 'failed',
      jsonb_build_object('constate', montant_constate, 'attendu', ligne.amount));
    return ligne;
  end if;

  update public.payments
  set status = case when encaisse then 'paid'::public.payment_status else 'failed'::public.payment_status end,
      provider_ref = ref_prestataire,
      provider_status = etat_prestataire,
      last_error = detail,
      paid_at = case when encaisse then now() else paid_at end,
      updated_at = now()
  where id = ligne.id
  returning * into ligne;

  if not encaisse then
    perform app.log_event('payment', ligne.id, 'settle', 'pending', 'failed',
      jsonb_build_object('provider_status', etat_prestataire));
    return ligne;
  end if;

  select * into cmd from public.orders where id = ligne.order_id;

  update public.orders
  set status = case
        when ligne.purpose in ('full', 'balance') then 'paid'::public.order_status
        when ligne.purpose = 'deposit' and cmd.deposit_amount >= cmd.total then 'paid'::public.order_status
        else 'deposit_paid'::public.order_status
      end,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = ligne.order_id;

  perform app.log_event('payment', ligne.id, 'settle', 'pending', 'paid',
    jsonb_build_object('order_id', ligne.order_id, 'amount', ligne.amount,
                       'commission', ligne.commission, 'partner_due', ligne.partner_due));

  return ligne;
end;
$$;

revoke execute on function public.settle_payment(text, text, text, boolean, bigint, text)
  from public, anon, authenticated;
grant execute on function public.settle_payment(text, text, text, boolean, bigint, text) to service_role;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Lecture seule pour tout le monde : une commande naît d'un déclencheur, un
-- paiement d'une fonction `SECURITY DEFINER`. Aucune politique d'écriture,
-- donc aucun chemin par lequel un client fixerait son propre montant.
-- -----------------------------------------------------------------------------
alter table orders enable row level security;
alter table payments enable row level security;

grant select on orders to authenticated;
grant select on payments to authenticated;

create policy orders_select on orders
  for select using (
    client_id = auth.uid()
    or app.is_org_member(org_id)
    or app.is_admin()
  );

create policy payments_select on payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and (o.client_id = auth.uid() or app.is_org_member(o.org_id) or app.is_admin())
    )
  );
