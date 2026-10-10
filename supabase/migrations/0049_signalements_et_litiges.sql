-- =============================================================================
-- 0049 — Signalements et litiges
--
-- Les deux recours du lot A, et ils ne se ressemblent pas :
--
--   **Un signalement** porte sur un **contenu** — un avis, une annonce. Il se
--   tranche en le lisant, par la modération, et ne coûte rien à personne.
--
--   **Un litige** porte sur une **réservation payée**. Il se tranche en
--   établissant les faits, il touche à l'argent, et il a deux parties qui ne
--   racontent pas la même chose.
--
-- Les mettre dans la même table aurait paru économique et aurait tout mélangé :
-- l'un se résout en une minute, l'autre en plusieurs échanges ; l'un n'a qu'un
-- auteur, l'autre deux parties. C'est aussi ce que dit le menu — les litiges
-- sont rangés dans **Finances**, les signalements dans **Système**.
--
-- -----------------------------------------------------------------------------
-- La décision la plus discutable de ce lot, et pourquoi elle tient quand même
-- -----------------------------------------------------------------------------
--
-- **Un avis signalé est retiré immédiatement**, avant tout examen. C'est le
-- choix de l'exploitant, et il a une bonne raison : un propos diffamatoire
-- laissé en ligne trois jours sur la fiche d'un partenaire lui coûte des
-- clients qu'aucune modération tardive ne lui rendra.
--
-- ⚠️ **Pris tel quel, ce choix est une arme.** Un partenaire signalerait chacun
-- de ses mauvais avis et les ferait tous disparaître ; un concurrent
-- signalerait les **bons** avis d'un rival pour le faire reculer au classement.
-- Trois bornes, et aucune n'est décorative :
--
--   1. **Le retrait automatique n'opère que pour une partie concernée** — un
--      membre de l'organisation notée. C'est elle que la mesure protège.
--      Le signalement d'un tiers est enregistré et examiné, sans rien masquer :
--      un concurrent ne peut donc pas éteindre les bons avis d'un rival.
--   2. **Un avis rétabli est immunisé** (`reviews.reinstated_at`). Un second
--      signalement ne le masquera plus. Sans cela, il suffisait de resignaler
--      après chaque examen pour masquer un avis à perpétuité.
--   3. **Un plafond de débit**, dans un déclencheur de table comme tous les
--      autres (0045). Signaler dix avis en dix minutes n'est pas de la
--      modération, c'est du nettoyage.
--
-- Ce qui reste possible, et qu'il faut dire plutôt que prétendre l'avoir
-- résolu : un partenaire peut faire masquer **une fois** chacun de ses mauvais
-- avis, le temps de l'examen. Le coût retombe sur lui — l'administration voit
-- la rafale, et chaque avis rétabli devient définitivement intouchable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Signalements
-- -----------------------------------------------------------------------------
create type report_target as enum ('review', 'listing');
create type report_status as enum ('open', 'upheld', 'dismissed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('SIG'),

  reporter_id uuid not null references profiles (id) on delete cascade,

  target_type report_target not null,
  review_id uuid references reviews (id) on delete cascade,
  listing_id uuid references listings (id) on delete cascade,

  reason text not null check (length(btrim(reason)) between 15 and 2000),

  status report_status not null default 'open',
  -- La décision, en clair. Relue le jour où l'auteur de l'avis réclame.
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid references profiles (id) on delete set null,

  created_at timestamptz not null default now(),

  -- Exactement une cible, et du genre annoncé : sans cette contrainte, un
  -- signalement sans cible serait possible, et l'écran d'administration
  -- afficherait une ligne qui ne mène nulle part.
  constraint report_target_coherent check (
    (target_type = 'review' and review_id is not null and listing_id is null)
    or (target_type = 'listing' and listing_id is not null and review_id is null)
  ),
  constraint report_resolution_dated check ((resolved_at is null) = (status = 'open'))
);

comment on table reports is
  'Signalements de contenu — un avis ou une annonce. Un avis signalé par une '
  'partie concernée est retiré immédiatement, en attente d''examen. '
  'Migration 0049.';

-- Un signalement par personne et par cible : resignaler n'ajoute pas de poids,
-- et laisserait croire à un nombre de plaintes qui n'existe pas.
create unique index reports_un_par_avis on reports (reporter_id, review_id)
  where review_id is not null;
create unique index reports_un_par_annonce on reports (reporter_id, listing_id)
  where listing_id is not null;

create index reports_a_traiter on reports (created_at) where status = 'open';
create index reports_debit_idx on reports (reporter_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Litiges
--
-- `withdrawn` plutôt que `cancelled` : c'est celui qui l'a ouvert qui renonce,
-- et le mot le dit. `cancelled` se confondrait avec une commande annulée.
-- -----------------------------------------------------------------------------
create type dispute_status as enum (
  'open',
  'under_review',
  'resolved_refund',
  'resolved_partner',
  'withdrawn'
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('LIT'),

  order_id uuid not null references orders (id) on delete restrict,
  opened_by uuid not null references profiles (id) on delete restrict,
  -- Figé à l'ouverture : un membre peut quitter l'organisation ensuite, et le
  -- litige doit rester lisible du bon côté. Même motif que
  -- `messages.sender_side` (0037).
  side text not null check (side in ('client', 'partner')),

  reason text not null check (length(btrim(reason)) between 30 and 4000),

  status dispute_status not null default 'open',

  -- Remboursement **existant** rattaché à la décision. Voir plus bas : ce lot
  -- n'ouvre aucune nouvelle façon de déplacer de l'argent.
  refund_id uuid references refunds (id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid references profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dispute_resolution_dated check (
    (resolved_at is null) = (status in ('open', 'under_review'))
  )
);

comment on table disputes is
  'Réservations contestées. Un litige exige un règlement encaissé : sans '
  'argent déplacé, le recours est l''annulation ou le support. Migration 0049.';

-- Un seul litige ouvert par commande. Deux plaintes simultanées sur la même
-- réservation feraient deux décisions possibles, donc une contradiction.
create unique index disputes_un_ouvert_par_commande on disputes (order_id)
  where status in ('open', 'under_review');

create index disputes_a_traiter on disputes (created_at) where status in ('open', 'under_review');
create index disputes_org on disputes (order_id, created_at desc);
create index disputes_debit_idx on disputes (opened_by, created_at desc);

create trigger disputes_updated_at
  before update on disputes
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ouvrir un signalement
--
-- `security definer` : vérifier qu'un avis existe demande de le lire, et un
-- avis déjà masqué est invisible à un tiers. Sans cela, signaler un avis
-- masqué par quelqu'un d'autre lèverait « introuvable » — un message faux.
-- -----------------------------------------------------------------------------
create or replace function public.open_report(
  genre public.report_target,
  cible uuid,
  motif text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := btrim(coalesce(motif, ''));
  moi uuid := auth.uid();
  ref text;
begin
  if moi is null then
    raise exception 'Connectez-vous pour signaler un contenu.' using errcode = 'insufficient_privilege';
  end if;

  if length(m) < 15 then
    raise exception 'Expliquez en au moins 15 caractères ce qui pose problème.'
      using errcode = 'check_violation';
  end if;

  if genre = 'review' then
    if not exists (select 1 from public.reviews r where r.id = cible) then
      raise exception 'Cet avis est introuvable.' using errcode = 'no_data_found';
    end if;

    insert into public.reports (reporter_id, target_type, review_id, reason)
    values (moi, 'review', cible, m)
    returning reference into ref;
  else
    if not exists (select 1 from public.listings l where l.id = cible) then
      raise exception 'Cette annonce est introuvable.' using errcode = 'no_data_found';
    end if;

    insert into public.reports (reporter_id, target_type, listing_id, reason)
    values (moi, 'listing', cible, m)
    returning reference into ref;
  end if;

  perform app.log_event('report', cible, 'open', null, 'open',
    jsonb_build_object('genre', genre, 'reference', ref));

  return ref;
exception
  when unique_violation then
    raise exception 'Vous avez déjà signalé ce contenu : votre signalement est en cours d''examen.'
      using errcode = 'check_violation';
end;
$$;

revoke all on function public.open_report(public.report_target, uuid, text) from public, anon;
grant execute on function public.open_report(public.report_target, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Le retrait immédiat, et ses trois bornes
--
-- Dans un déclencheur de table plutôt qu'en tête d'`open_report` : c'est la
-- règle du §2 du guide, et elle vaut ici autant qu'ailleurs — le jour où un
-- second chemin d'écriture apparaîtra (un import, une reprise), le retrait
-- suivra sans qu'on y pense.
-- -----------------------------------------------------------------------------
create or replace function app.retirer_sur_signalement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  if new.target_type <> 'review' then
    return null;
  end if;

  select r.org_id, r.hidden_at, r.reinstated_at into a
  from public.reviews r where r.id = new.review_id;

  -- Borne 1 : seule une partie concernée déclenche le retrait. Un tiers — donc
  -- un concurrent — ne peut pas éteindre un avis qui ne le vise pas.
  if not app.is_org_member(a.org_id) then
    return null;
  end if;

  -- Borne 2 : un avis rétabli après examen est définitivement immunisé.
  if a.reinstated_at is not null or a.hidden_at is not null then
    return null;
  end if;

  update public.reviews
  set hidden_at = now(),
      hidden_reason = 'Signalement ' || new.reference || ' — examen en cours',
      hidden_by = new.reporter_id
  where id = new.review_id;

  return null;
end;
$$;

create trigger reports_retirer_avis
  after insert on reports
  for each row execute function app.retirer_sur_signalement();

-- Borne 3 : le plafond de débit. Signaler dix avis en dix minutes n'est pas de
-- la modération. Les deux bords sont éprouvés — un plafond trop serré est une
-- panne, pas une protection (0045).
create or replace function app.guard_debit_signalements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derniere_heure int;
  dernier_jour int;
begin
  if app.hors_plafond() then return new; end if;

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day')
  into derniere_heure, dernier_jour
  from public.reports
  where reporter_id = new.reporter_id;

  if derniere_heure >= 5 then
    perform app.refuser_debit('signalé plusieurs contenus', 'dans une heure');
  end if;

  if dernier_jour >= 20 then
    perform app.refuser_debit('signalé beaucoup de contenus aujourd''hui', 'demain');
  end if;

  return new;
end;
$$;

create trigger reports_debit_guard
  before insert on reports
  for each row execute function app.guard_debit_signalements();

-- -----------------------------------------------------------------------------
-- Trancher un signalement
--
-- `dismissed` rétablit l'avis **et l'immunise** : c'est le même geste que
-- `reinstate_review`, et c'est ce qui empêche la boucle du resignalement.
-- `upheld` réécrit le motif de masquage avec la décision — sans quoi la trace
-- resterait « examen en cours » pour toujours.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_report(
  signalement uuid,
  issue public.report_status,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  n text := nullif(btrim(coalesce(note, '')), '');
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''équipe ÉniEvent.' using errcode = 'insufficient_privilege';
  end if;

  if issue = 'open' then
    raise exception 'Un signalement se tranche en « retenu » ou « écarté ».'
      using errcode = 'check_violation';
  end if;

  select r.target_type, r.review_id, r.reference, r.status into s
  from public.reports r where r.id = signalement;

  if not found then
    raise exception 'Ce signalement est introuvable.' using errcode = 'no_data_found';
  end if;

  if s.status <> 'open' then
    raise exception 'Ce signalement a déjà été tranché.' using errcode = 'check_violation';
  end if;

  update public.reports
  set status = issue, resolution = n, resolved_at = now(), resolved_by = auth.uid()
  where id = signalement;

  if s.target_type = 'review' then
    if issue = 'dismissed' then
      -- Rétabli **et** immunisé : un nouveau signalement ne le masquera plus.
      update public.reviews
      set hidden_at = null, hidden_reason = null, hidden_by = null, reinstated_at = now()
      where id = s.review_id and hidden_at is not null;
    else
      update public.reviews
      set hidden_at = coalesce(hidden_at, now()),
          hidden_reason = coalesce(n, 'Signalement ' || s.reference || ' retenu'),
          hidden_by = coalesce(hidden_by, auth.uid())
      where id = s.review_id;
    end if;
  end if;

  perform app.log_event('report', signalement, 'resolve', 'open', issue::text,
    jsonb_build_object('note', n));
end;
$$;

revoke all on function public.resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.resolve_report(uuid, public.report_status, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Ouvrir un litige
--
-- **Un règlement encaissé est exigé**, et c'est la ligne qui sépare un litige
-- d'une réclamation : sans argent déplacé, le recours est l'annulation — qui
-- applique un barème connu et rend ce qui est dû — ou le support. Ouvrir un
-- litige sur une réservation impayée donnerait à arbitrer un désaccord sans
-- objet, et ferait de `/admin/litiges` une seconde boîte de support.
--
-- Une commande annulée ou remboursée **reste** contestable : « on m'a rendu
-- moins que prévu » est précisément un litige.
-- -----------------------------------------------------------------------------
create or replace function public.open_dispute(commande uuid, motif text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  m text := btrim(coalesce(motif, ''));
  moi uuid := auth.uid();
  camp text;
  ref text;
begin
  if moi is null then
    raise exception 'Connectez-vous pour ouvrir un litige.' using errcode = 'insufficient_privilege';
  end if;

  if length(m) < 30 then
    raise exception 'Décrivez en au moins 30 caractères ce qui s''est passé : c''est sur ce récit que nous trancherons.'
      using errcode = 'check_violation';
  end if;

  select o.client_id, o.org_id into c from public.orders o where o.id = commande;

  if not found then
    raise exception 'Cette réservation est introuvable.' using errcode = 'no_data_found';
  end if;

  if c.client_id = moi then
    camp := 'client';
  elsif app.has_org_role(c.org_id, array['owner', 'manager']::public.org_role[]) then
    camp := 'partner';
  else
    raise exception 'Seules les deux parties d''une réservation peuvent ouvrir un litige.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.payments p
    where p.order_id = commande and p.status in ('paid', 'refunded')
  ) then
    raise exception 'Aucun règlement n''a encore été encaissé sur cette réservation : utilisez l''annulation, ou écrivez-nous.'
      using errcode = 'check_violation';
  end if;

  insert into public.disputes (order_id, opened_by, side, reason)
  values (commande, moi, camp, m)
  returning reference into ref;

  perform app.log_event('dispute', commande, 'open', null, 'open',
    jsonb_build_object('camp', camp, 'reference', ref));

  return ref;
exception
  when unique_violation then
    raise exception 'Un litige est déjà ouvert sur cette réservation.' using errcode = 'check_violation';
end;
$$;

revoke all on function public.open_dispute(uuid, text) from public, anon;
grant execute on function public.open_dispute(uuid, text) to authenticated;

create or replace function app.guard_debit_litiges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recents int;
begin
  if app.hors_plafond() then return new; end if;

  select count(*) into recents
  from public.disputes
  where opened_by = new.opened_by and created_at > now() - interval '1 day';

  if recents >= 5 then
    perform app.refuser_debit('ouvert plusieurs litiges aujourd''hui', 'demain');
  end if;

  return new;
end;
$$;

create trigger disputes_debit_guard
  before insert on disputes
  for each row execute function app.guard_debit_litiges();

-- -----------------------------------------------------------------------------
-- Retirer son litige
--
-- Les deux parties s'arrangent souvent entre elles, et il faut une sortie qui
-- ne soit pas une décision de la plateforme. Réservé à celui qui l'a ouvert :
-- l'autre partie ne retire pas une plainte qui la vise.
-- -----------------------------------------------------------------------------
create or replace function public.withdraw_dispute(litige uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  select l.opened_by, l.status into d from public.disputes l where l.id = litige;

  if not found then
    raise exception 'Ce litige est introuvable.' using errcode = 'no_data_found';
  end if;

  if d.opened_by is distinct from auth.uid() then
    raise exception 'Seule la partie qui a ouvert un litige peut le retirer.'
      using errcode = 'insufficient_privilege';
  end if;

  if d.status not in ('open', 'under_review') then
    raise exception 'Ce litige est déjà clos.' using errcode = 'check_violation';
  end if;

  update public.disputes
  set status = 'withdrawn',
      resolution = nullif(btrim(coalesce(note, '')), ''),
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = litige;

  perform app.log_event('dispute', litige, 'withdraw', d.status::text, 'withdrawn');
end;
$$;

revoke all on function public.withdraw_dispute(uuid, text) from public, anon;
grant execute on function public.withdraw_dispute(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Trancher un litige
--
-- ⚠️ **Cette fonction ne déplace pas un franc, et c'est délibéré.** Un lot sur
-- la confiance n'est pas l'endroit où ouvrir une seconde façon de rembourser :
-- il en existe une, `cancel_order`, qui applique le barème figé sur la commande
-- et borne le rendu à l'encaissé (§1 du guide). Trancher en faveur du client
-- veut donc dire : annuler depuis `/admin/reservations`, puis **rattacher ici**
-- le remboursement produit. On consigne une décision, on n'invente pas un
-- virement.
--
-- Le remboursement rattaché est vérifié : il doit porter sur **cette**
-- commande. Un identifiant copié de travers lierait un litige au
-- remboursement de quelqu'un d'autre, et le journal mentirait.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_dispute(
  litige uuid,
  issue public.dispute_status,
  note text,
  remboursement uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  n text := btrim(coalesce(note, ''));
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''équipe ÉniEvent.' using errcode = 'insufficient_privilege';
  end if;

  if issue not in ('under_review', 'resolved_refund', 'resolved_partner') then
    raise exception 'Issue inattendue : un litige passe en examen, ou se tranche en faveur d''une partie.'
      using errcode = 'check_violation';
  end if;

  select l.order_id, l.status into d from public.disputes l where l.id = litige;

  if not found then
    raise exception 'Ce litige est introuvable.' using errcode = 'no_data_found';
  end if;

  if d.status not in ('open', 'under_review') then
    raise exception 'Ce litige est déjà clos.' using errcode = 'check_violation';
  end if;

  -- Une décision sans motif est inexploitable : c'est elle que lira la partie
  -- qui perd, et c'est elle qu'on relira en cas de contestation.
  if issue <> 'under_review' and length(n) < 30 then
    raise exception 'Écrivez la décision en au moins 30 caractères : les deux parties la liront.'
      using errcode = 'check_violation';
  end if;

  if remboursement is not null and not exists (
    select 1 from public.refunds r where r.id = remboursement and r.order_id = d.order_id
  ) then
    raise exception 'Ce remboursement ne porte pas sur la réservation en litige.'
      using errcode = 'check_violation';
  end if;

  update public.disputes
  set status = issue,
      resolution = nullif(n, ''),
      refund_id = coalesce(remboursement, refund_id),
      resolved_at = case when issue = 'under_review' then null else now() end,
      resolved_by = case when issue = 'under_review' then null else auth.uid() end
  where id = litige;

  perform app.log_event('dispute', litige, 'resolve', d.status::text, issue::text,
    jsonb_build_object('note', nullif(n, ''), 'remboursement', remboursement));
end;
$$;

revoke all on function public.resolve_dispute(uuid, public.dispute_status, text, uuid)
  from public, anon;
grant execute on function public.resolve_dispute(uuid, public.dispute_status, text, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- RLS et privilèges
--
-- **Un signalement ne se montre pas à sa cible.** Un client qui signale une
-- annonce ne doit pas être identifiable par le partenaire qu'il signale — sans
-- quoi personne ne signalerait plus rien. Lecture réservée à son auteur et à
-- l'administration.
--
-- **Un litige, au contraire, se montre aux deux parties.** On ne peut pas
-- demander à quelqu'un de se défendre d'un reproche qu'il ne lit pas. Le nom de
-- l'auteur n'y est d'ailleurs pas un secret : il n'y a que deux parties.
-- -----------------------------------------------------------------------------
alter table reports enable row level security;
alter table disputes enable row level security;

create policy reports_select on reports
  for select using (reporter_id = auth.uid() or app.is_admin());

-- Aucune politique d'écriture : tout passe par `open_report` et
-- `resolve_report`, qui sont `security definer`. Un `insert` direct serait le
-- moyen de contourner le plafond de débit — non, le déclencheur le garde aussi.
-- Mais il serait surtout le moyen de signaler **sous le nom d'un autre**.
revoke all on reports from anon, authenticated;
grant select (
  id, reference, reporter_id, target_type, review_id, listing_id,
  reason, status, resolution, resolved_at, created_at
) on reports to authenticated;

create policy disputes_select on disputes
  for select using (
    opened_by = auth.uid()
    or exists (
      select 1 from public.orders o
      where o.id = disputes.order_id
        and (o.client_id = auth.uid() or app.is_org_member(o.org_id))
    )
    or app.is_admin()
  );

revoke all on disputes from anon, authenticated;
grant select (
  id, reference, order_id, opened_by, side, reason, status,
  refund_id, resolution, resolved_at, created_at, updated_at
) on disputes to authenticated;

-- -----------------------------------------------------------------------------
-- Ce que l'administration lit
--
-- Même motif qu'`admin_reviews()` : les écrans d'administration ont besoin de
-- jointures qu'un simple `select` ne leur donnerait pas — le nom du partenaire,
-- le titre de l'annonce, le texte de l'avis signalé — et dont certaines
-- traversent des tables fermées.
-- -----------------------------------------------------------------------------
create or replace function public.admin_reports(etat text default 'ouverts')
returns table (
  id uuid,
  reference text,
  created_at timestamptz,
  target_type public.report_target,
  reason text,
  status public.report_status,
  resolution text,
  review_id uuid,
  review_rating smallint,
  review_body text,
  review_author text,
  review_hidden_at timestamptz,
  listing_id uuid,
  listing_title text,
  org_name text,
  reporter_label text,
  reporter_is_party boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.reference, s.created_at, s.target_type, s.reason, s.status, s.resolution,
         s.review_id, r.rating, r.body, r.author_label, r.hidden_at,
         s.listing_id,
         coalesce(l.title, rl.title) as listing_title,
         coalesce(ro.brand_name, ro.legal_name, lo.brand_name, lo.legal_name) as org_name,
         coalesce(p.full_name, 'Compte sans nom') as reporter_label,
         -- Dit à l'écran ce qui a provoqué — ou non — le retrait automatique.
         exists (
           select 1 from public.organization_members m
           where m.user_id = s.reporter_id
             and m.status = 'active'
             and m.org_id = coalesce(r.org_id, l.org_id)
         ) as reporter_is_party
  from public.reports s
  left join public.reviews r on r.id = s.review_id
  left join public.listings rl on rl.id = r.listing_id
  left join public.organizations ro on ro.id = r.org_id
  left join public.listings l on l.id = s.listing_id
  left join public.organizations lo on lo.id = l.org_id
  left join public.profiles p on p.id = s.reporter_id
  where app.is_admin()
    and case etat
      when 'ouverts' then s.status = 'open'
      when 'traites' then s.status <> 'open'
      else true
    end
  order by s.created_at desc;
$$;

revoke all on function public.admin_reports(text) from public, anon;
grant execute on function public.admin_reports(text) to authenticated;

create or replace function public.admin_disputes(etat text default 'ouverts')
returns table (
  id uuid,
  reference text,
  created_at timestamptz,
  side text,
  reason text,
  status public.dispute_status,
  resolution text,
  refund_id uuid,
  refund_reference text,
  refund_amount bigint,
  order_id uuid,
  order_reference text,
  order_total bigint,
  order_currency text,
  order_status public.order_status,
  paid_amount bigint,
  event_date date,
  listing_title text,
  org_id uuid,
  org_name text,
  client_label text
)
language sql
security definer
set search_path = ''
stable
as $$
  select l.id, l.reference, l.created_at, l.side, l.reason, l.status, l.resolution,
         l.refund_id, rb.reference, rb.amount,
         o.id, o.reference, o.total, o.currency, o.status,
         coalesce((
           select sum(p.amount) from public.payments p
           where p.order_id = o.id and p.status = 'paid'
         ), 0)::bigint as paid_amount,
         coalesce(o.end_date, o.event_date) as event_date,
         coalesce(li.title, o.listing_title) as listing_title,
         o.org_id,
         coalesce(g.brand_name, g.legal_name) as org_name,
         coalesce(c.full_name, 'Compte sans nom') as client_label
  from public.disputes l
  join public.orders o on o.id = l.order_id
  left join public.refunds rb on rb.id = l.refund_id
  left join public.listings li on li.id = o.listing_id
  join public.organizations g on g.id = o.org_id
  left join public.profiles c on c.id = o.client_id
  where app.is_admin()
    and case etat
      when 'ouverts' then l.status in ('open', 'under_review')
      when 'clos' then l.status not in ('open', 'under_review')
      else true
    end
  order by l.created_at;
$$;

revoke all on function public.admin_disputes(text) from public, anon;
grant execute on function public.admin_disputes(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Notifications
--
-- Un signalement part vers **l'équipe**, comme `support.new` : il n'a pas de
-- destinataire personnel, et le motif y voyage parce que l'équipe a de toute
-- façon accès à la table (même raisonnement qu'en 0042).
--
-- Un litige part vers **l'autre partie** et vers l'équipe. Celle qui l'ouvre le
-- sait déjà ; celle qui est mise en cause doit pouvoir se défendre, et apprendre
-- par surprise qu'une décision a été prise sans elle serait le pire parcours
-- possible.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_report_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinataire text;
begin
  select c.value into destinataire from app.runtime_config c where c.key = 'support_email';

  if destinataire is null or btrim(destinataire) = '' then
    return new;
  end if;

  insert into public.notifications (channel, recipient, kind, ref_id, payload)
  values ('email', destinataire, 'report.new', new.id,
          jsonb_build_object(
            'reference', new.reference,
            'genre', new.target_type,
            'reason', new.reason
          ))
  on conflict do nothing;

  return new;
end;
$$;

create trigger reports_notify
  after insert on reports
  for each row execute function app.enqueue_report_notification();

create or replace function app.enqueue_dispute_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  autre text;
  equipe text;
  enseigne text;
begin
  select o.client_id, o.org_id, o.reference into c
  from public.orders o where o.id = new.order_id;

  select coalesce(g.brand_name, g.legal_name) into enseigne
  from public.organizations g where g.id = c.org_id;

  -- L'autre partie : si le client ouvre, on prévient le partenaire, et
  -- réciproquement.
  if new.side = 'client' then
    autre := app.org_email(c.org_id);
  else
    select u.email::text into autre
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = c.client_id;
  end if;

  if autre is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', autre, 'dispute.opened', new.id,
            jsonb_build_object(
              'reference', new.reference,
              'orderReference', c.reference,
              'partner', enseigne,
              -- ⚠️ Le destinataire est **l'autre** partie : `pour` dit laquelle,
              -- et la rédaction en dépend entièrement.
              'pour', case when new.side = 'client' then 'partner' else 'client' end
            ),
            c.org_id)
    on conflict do nothing;
  end if;

  select cfg.value into equipe from app.runtime_config cfg where cfg.key = 'support_email';

  if equipe is not null and btrim(equipe) <> '' then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', equipe, 'dispute.opened', new.id,
            jsonb_build_object(
              'reference', new.reference,
              'orderReference', c.reference,
              'partner', enseigne,
              'pour', 'equipe'
            ),
            c.org_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger disputes_notify
  after insert on disputes
  for each row execute function app.enqueue_dispute_notification();
