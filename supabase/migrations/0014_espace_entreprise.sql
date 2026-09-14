-- =============================================================================
-- 0014 — Espace entreprise : engagement, validation, suivi budgétaire.
--
-- Ce qui distingue une entreprise d'un particulier n'est pas le volume, c'est
-- que **la personne qui choisit n'est pas celle qui paie**. Trois mécanismes en
-- découlent :
--
-- 1. Chaque demande se rattache à un **centre de coût** — la table existe
--    depuis la migration 0002, avec son enveloppe et sa période.
-- 2. Au-delà d'un seuil, retenir une offre demande **l'aval d'un valideur**.
--    L'aval est tracé, motivé, et c'est lui qui déclenche l'acceptation.
-- 3. Le **consommé** se lit à tout moment : somme des offres retenues sur le
--    centre de coût. « Engagé », et non « payé » — la chaîne de paiement
--    arrivera avec le lot 2, mais l'engagement, lui, existe dès l'acceptation.
-- =============================================================================

create type approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type approval_subject as enum ('quote_request', 'quote');

-- -----------------------------------------------------------------------------
-- Réglages propres à l'entreprise
-- -----------------------------------------------------------------------------

create table company_settings (
  org_id uuid primary key references organizations (id) on delete cascade,

  -- Au-delà de ce montant, retenir une offre demande un aval. `null` = aucun
  -- contrôle : une petite structure n'a pas de circuit de validation, et lui
  -- en imposer un la ferait renoncer.
  approval_threshold bigint check (approval_threshold is null or approval_threshold >= 0),

  -- Publier un appel d'offres engage l'image de l'entreprise autant que son
  -- budget. Certaines veulent le valider aussi ; c'est un choix, pas une règle.
  approve_publication boolean not null default false,

  currency text not null default 'XOF',
  billing_email text,
  billing_address text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_settings_updated_at
  before update on company_settings
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Rattachement d'une demande à un centre de coût
-- -----------------------------------------------------------------------------

-- Cible de la clé étrangère composite : garantit qu'une demande ne peut pas
-- pointer le centre de coût d'une autre entreprise.
alter table cost_centers
  add constraint cost_centers_id_org_key unique (id, org_id);

alter table quote_requests
  add column if not exists cost_center_id uuid;

alter table quote_requests
  -- `restrict` et non `set null` : sur une clé composite, `set null` viderait
  -- aussi `org_id` et détacherait la demande de son entreprise. Un centre de
  -- coût se désactive (`is_active`), il ne se supprime pas.
  add constraint quote_requests_cost_center_fkey
    foreign key (cost_center_id, org_id) references cost_centers (id, org_id)
    on delete restrict,
  add constraint cost_center_needs_company
    check (cost_center_id is null or org_id is not null);

create index quote_requests_cost_center_idx on quote_requests (cost_center_id);

-- -----------------------------------------------------------------------------
-- Avals
-- -----------------------------------------------------------------------------

create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  subject approval_subject not null,
  subject_id uuid not null,

  -- Montant figé au moment de la demande. Le devis peut être retiré ensuite ;
  -- la trace de ce qui a été soumis au valideur doit rester intacte.
  amount bigint check (amount is null or amount >= 0),
  currency text not null default 'XOF',
  cost_center_id uuid references cost_centers (id) on delete set null,

  requested_by uuid not null references profiles (id) on delete cascade,
  status approval_status not null default 'pending',
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  -- Motif du refus : sans lui, le demandeur ne sait pas quoi corriger.
  reason text,

  created_at timestamptz not null default now()
);

create index approvals_org_idx on approvals (org_id, status, created_at desc);
create index approvals_subject_idx on approvals (subject, subject_id);

-- Un seul aval en cours par objet : deux demandes concurrentes donneraient deux
-- décisions contradictoires sur le même engagement.
create unique index approvals_one_pending_per_subject
  on approvals (subject, subject_id)
  where status = 'pending';

-- =============================================================================
-- Règles d'engagement
-- =============================================================================

/** Seuil de validation de l'entreprise portant cette demande, s'il y en a un. */
create or replace function app.company_threshold(target_request uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.approval_threshold
  from public.quote_requests r
  join public.company_settings s on s.org_id = r.org_id
  where r.id = target_request
$$;

/**
 * Retenir cette offre demande-t-il un aval ?
 *
 * Vrai seulement si la demande est portée par une entreprise, que celle-ci a
 * fixé un seuil, et que le montant le dépasse. Une demande de particulier ne
 * passe jamais par ici.
 */
create or replace function app.quote_needs_approval(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select q.subtotal > s.approval_threshold
      from public.quotes q
      join public.quote_request_items i on i.id = q.item_id
      join public.quote_requests r on r.id = i.request_id
      join public.company_settings s on s.org_id = r.org_id
      where q.id = target
        and s.approval_threshold is not null
    ),
    false
  )
$$;

/** Qui décide : les rôles qui engagent l'entreprise. */
create or replace function app.can_approve(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Type qualifié : `search_path = ''` s'applique aussi aux types, pas
  -- seulement aux tables.
  select app.has_org_role(
    target_org,
    array['owner', 'admin', 'approver', 'finance']::public.org_role[]
  )
$$;

-- -----------------------------------------------------------------------------
-- Transitions : la demande d'entreprise passe par l'aval avant publication
-- -----------------------------------------------------------------------------

create or replace function app.guard_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('pending_approval', 'open', 'cancelled'))
    or (old.status = 'pending_approval' and new.status in ('open', 'draft', 'cancelled'))
    or (old.status = 'open'   and new.status in ('closed', 'awarded', 'cancelled', 'expired'))
    or (old.status = 'closed' and new.status in ('open', 'awarded', 'cancelled'))
  ) then
    raise exception 'Transition % vers % interdite pour une demande de devis.',
      old.status, new.status using errcode = 'check_violation';
  end if;

  -- La publication est horodatée quelle que soit la porte empruntée : passage
  -- direct pour un particulier, ou après aval pour une entreprise.
  if new.status = 'open' and old.status in ('draft', 'pending_approval') then
    new.published_at := now();
    new.respond_by := coalesce(new.respond_by, now() + interval '48 hours');
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Acceptation soumise à l'aval
-- -----------------------------------------------------------------------------

create or replace function public.accept_quote(target uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item uuid;
  v_request uuid;
  v_status public.quote_status;
  v_remaining integer;
begin
  select q.item_id, q.status, i.request_id
    into v_item, v_status, v_request
  from public.quotes q
  join public.quote_request_items i on i.id = q.item_id
  where q.id = target;

  if v_item is null then
    raise exception 'Devis introuvable.' using errcode = 'no_data_found';
  end if;

  if not app.owns_request(v_request) then
    raise exception 'Seul le demandeur peut accepter un devis.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'sent' then
    raise exception 'Seul un devis envoyé peut être accepté (état actuel : %).', v_status
      using errcode = 'check_violation';
  end if;

  -- Contrôle propre à l'entreprise. `decide_approval` pose ce drapeau : c'est
  -- l'aval accordé qui déclenche l'acceptation, en une seule transaction.
  if app.quote_needs_approval(target)
     and coalesce(current_setting('app.approval_granted', true), '') <> target::text then
    raise exception
      'Ce montant dépasse le seuil de validation de votre entreprise : demandez l''aval d''un valideur.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.accepting_quote', target::text, true);

  update public.quotes set status = 'accepted' where id = target;

  update public.quotes
  set status = 'declined',
      decline_reason = coalesce(decline_reason, 'Une autre proposition a été retenue.')
  where item_id = v_item and id <> target and status = 'sent';

  update public.quote_request_items
  set awarded_quote_id = target
  where id = v_item;

  select count(*) into v_remaining
  from public.quote_request_items
  where request_id = v_request and awarded_quote_id is null;

  if v_remaining = 0 then
    update public.quote_requests
    set status = 'awarded'
    where id = v_request and status in ('open', 'closed');
  end if;

  perform app.log_event('quote', target, 'accept', v_status::text, 'accepted',
    jsonb_build_object('item_id', v_item, 'request_id', v_request));

  perform set_config('app.accepting_quote', '', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Demander un aval
-- -----------------------------------------------------------------------------

create or replace function public.request_quote_approval(target uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_request uuid;
  v_cost_center uuid;
  v_amount bigint;
  v_currency text;
  v_id uuid;
begin
  select r.org_id, r.id, r.cost_center_id, q.subtotal, q.currency
    into v_org, v_request, v_cost_center, v_amount, v_currency
  from public.quotes q
  join public.quote_request_items i on i.id = q.item_id
  join public.quote_requests r on r.id = i.request_id
  where q.id = target and q.status = 'sent';

  if v_request is null then
    raise exception 'Devis introuvable, ou déjà décidé.' using errcode = 'no_data_found';
  end if;

  if v_org is null then
    raise exception 'Cette demande n''est pas portée par une entreprise.'
      using errcode = 'check_violation';
  end if;

  if not app.owns_request(v_request) then
    raise exception 'Vous ne portez pas cette demande.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.approvals
    (org_id, subject, subject_id, amount, currency, cost_center_id, requested_by)
  values
    (v_org, 'quote', target, v_amount, v_currency, v_cost_center, auth.uid())
  -- Redemander l'aval d'une offre déjà soumise ne crée pas de doublon : c'est
  -- l'index partiel qui l'interdit, on renvoie simplement la demande en cours.
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.approvals
    where subject = 'quote' and subject_id = target and status = 'pending';
  end if;

  perform app.log_event('quote', target, 'request_approval', null, 'pending',
    jsonb_build_object('approval_id', v_id, 'amount', v_amount));

  return v_id;
end;
$$;

/** Soumet un appel d'offres à l'aval avant publication. */
create or replace function public.request_publication_approval(target uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select org_id into v_org from public.quote_requests where id = target and status = 'draft';

  if v_org is null then
    raise exception 'Demande introuvable, ou déjà publiée.' using errcode = 'no_data_found';
  end if;

  if not app.owns_request(target) then
    raise exception 'Vous ne portez pas cette demande.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.approvals
    (org_id, subject, subject_id, amount, currency, cost_center_id, requested_by)
  select v_org, 'quote_request', target, r.budget_max, r.currency, r.cost_center_id, auth.uid()
  from public.quote_requests r
  where r.id = target
  on conflict do nothing
  returning id into v_id;

  update public.quote_requests set status = 'pending_approval' where id = target;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Décider
-- -----------------------------------------------------------------------------

create or replace function public.decide_approval(
  target uuid,
  p_approve boolean,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_subject public.approval_subject;
  v_subject_id uuid;
  v_status public.approval_status;
begin
  select org_id, subject, subject_id, status
    into v_org, v_subject, v_subject_id, v_status
  from public.approvals
  where id = target;

  if v_org is null then
    raise exception 'Demande d''aval introuvable.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if not app.can_approve(v_org) then
    raise exception 'Seul un valideur de l''entreprise peut décider.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'pending' then
    raise exception 'Cette demande d''aval est déjà décidée (%).', v_status
      using errcode = 'check_violation';
  end if;

  if not p_approve and coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception 'Indiquez au demandeur pourquoi vous refusez, en une phrase.'
      using errcode = 'check_violation';
  end if;

  update public.approvals
  -- Conversion explicite : `case when` produit du texte, la colonne est une
  -- énumération.
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.approval_status,
      decided_by = auth.uid(),
      decided_at = now(),
      reason = p_reason
  where id = target;

  if p_approve then
    if v_subject = 'quote' then
      -- L'aval accordé **est** l'acceptation : un aller-retour de plus
      -- laisserait une offre validée mais non retenue, et le fournisseur dans
      -- l'attente sans rien pour l'expliquer.
      perform set_config('app.approval_granted', v_subject_id::text, true);
      perform public.accept_quote(v_subject_id);
      perform set_config('app.approval_granted', '', true);
    else
      update public.quote_requests
      set status = 'open'
      where id = v_subject_id and status = 'pending_approval';
    end if;
  elsif v_subject = 'quote_request' then
    -- Refusée : la demande retourne au brouillon, son auteur la corrige.
    update public.quote_requests
    set status = 'draft'
    where id = v_subject_id and status = 'pending_approval';
  end if;

  perform app.log_event(
    v_subject::text, v_subject_id,
    case when p_approve then 'approve' else 'reject' end,
    'pending', case when p_approve then 'approved' else 'rejected' end,
    jsonb_build_object('approval_id', target, 'reason', p_reason)
  );
end;
$$;

-- =============================================================================
-- Consommation budgétaire
-- =============================================================================

-- `security_invoker` : la RLS des tables sous-jacentes s'applique à l'appelant.
-- Sans lui, la vue tournerait avec les droits de son propriétaire et exposerait
-- les budgets de toutes les entreprises.
create view company_budget_usage
with (security_invoker = true)
as
select
  cc.id as cost_center_id,
  cc.org_id,
  cc.code,
  cc.name,
  cc.currency,
  cc.budget_amount,
  cc.period_start,
  cc.period_end,
  cc.is_active,
  -- « Engagé », pas « payé » : une offre retenue engage l'entreprise bien avant
  -- que le premier franc ne soit versé.
  coalesce(sum(q.subtotal) filter (where q.status = 'accepted'), 0)::bigint as committed,
  cc.budget_amount - coalesce(sum(q.subtotal) filter (where q.status = 'accepted'), 0)
    as remaining,
  count(distinct r.id)::integer as request_count
from cost_centers cc
left join quote_requests r on r.cost_center_id = cc.id
left join quote_request_items i on i.request_id = r.id
left join quotes q on q.item_id = i.id
group by cc.id;

comment on view company_budget_usage is
  'Enveloppe, engagé et restant par centre de coût. L''engagé est la somme des '
  'offres retenues — la chaîne de paiement arrive au lot 2, l''engagement existe '
  'dès l''acceptation.';

-- =============================================================================
-- RLS
-- =============================================================================

alter table company_settings enable row level security;
alter table approvals enable row level security;

create policy company_settings_select on company_settings
  for select using (org_id in (select app.user_org_ids()) or app.is_admin());

create policy company_settings_manage on company_settings
  for all
  using (app.has_org_role(org_id, array['owner', 'admin', 'finance']::org_role[]) or app.is_admin())
  with check (
    app.has_org_role(org_id, array['owner', 'admin', 'finance']::org_role[]) or app.is_admin()
  );

-- Les avals sont lisibles par toute l'entreprise : savoir qui a engagé quoi
-- fait partie du contrôle interne. Les écritures passent par les fonctions.
create policy approvals_select on approvals
  for select using (org_id in (select app.user_org_ids()) or app.is_admin());

-- =============================================================================
-- Privilèges
-- =============================================================================

grant select, insert, update, delete on company_settings to authenticated;
grant select on approvals to authenticated;
grant select on company_budget_usage to authenticated;

grant execute on function
  public.request_quote_approval,
  public.request_publication_approval,
  public.decide_approval
  to authenticated;
