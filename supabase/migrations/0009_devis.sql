-- =============================================================================
-- 0009 — Appel d'offres : demandes de devis, propositions, journal d'audit.
--
-- C'est le second tunnel, celui qui distingue ÉniEvent d'un simple catalogue :
-- un client décrit son événement une fois, plusieurs prestataires répondent, il
-- compare et choisit.
--
-- Trois exigences structurent ce schéma :
--
-- 1. **Les offres sont scellées.** Un partenaire ne voit jamais la proposition
--    d'un concurrent. Sans cela la comparaison n'a plus de sens : le dernier à
--    répondre gagnerait toujours.
-- 2. **Le client ne voit pas les brouillons.** Une proposition n'existe pour lui
--    qu'une fois envoyée.
-- 3. **Aucune acceptation côté client.** Accepter un devis en refuse d'autres et
--    attribue un besoin : cela se joue dans une fonction `SECURITY DEFINER`,
--    jamais dans une suite d'UPDATE que le réseau peut interrompre à moitié.
-- =============================================================================

create type quote_request_status as enum (
  'draft',     -- le client rédige encore
  'open',      -- publiée, les partenaires peuvent répondre
  'closed',    -- plus de nouvelles offres, décision en cours
  'awarded',   -- tous les besoins attribués
  'cancelled',
  'expired'
);

create type quote_status as enum (
  'draft',     -- le partenaire prépare, invisible du client
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'expired'
);

create type event_type as enum (
  'mariage', 'anniversaire', 'bapteme', 'seminaire', 'conference',
  'lancement', 'ceremonie', 'funerailles', 'autre'
);

-- -----------------------------------------------------------------------------
-- Journal d'audit
--
-- Exigence du projet : aucune transition d'état n'est décidée côté client, et
-- toutes sont journalisées. La table naît ici parce que les devis sont la
-- première vraie machine à états de l'application.
-- -----------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- L'acteur peut disparaître ; sa trace, non — d'où le `set null`.
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  from_state text,
  to_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);

create or replace function app.log_event(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_from text default null,
  p_to text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, from_state, to_state, metadata)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, p_from, p_to, p_metadata)
$$;

-- -----------------------------------------------------------------------------
-- Demande de devis (le brief)
-- -----------------------------------------------------------------------------

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  -- Référence lisible : c'est elle que le client cite au téléphone.
  reference text not null unique,

  requester_id uuid not null references profiles (id) on delete cascade,
  -- Renseignée quand la demande est portée par une entreprise : la facturation
  -- et les validations budgétaires s'y rattacheront au lot 5.
  org_id uuid references organizations (id) on delete set null,

  title text not null,
  event_type event_type not null default 'autre',
  event_date date,
  event_end_date date,
  -- Une date souple élargit le champ des réponses possibles ; le partenaire
  -- doit le savoir avant de refuser.
  is_date_flexible boolean not null default false,

  city text not null,
  district text,
  guests integer check (guests is null or guests > 0),

  -- Budget global, en unité mineure. Facultatif : beaucoup de clients ne
  -- savent pas encore, et exiger un chiffre ferait abandonner le formulaire.
  budget_min bigint check (budget_min is null or budget_min >= 0),
  budget_max bigint check (budget_max is null or budget_max >= 0),
  currency text not null default 'XOF',

  description text,
  contact_phone text,

  status quote_request_status not null default 'draft',
  -- Date limite de réponse. La promesse « des devis rapidement » n'engage que
  -- si elle est inscrite dans la donnée, pas seulement dans la page d'accueil.
  respond_by timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_range_is_ordered
    check (budget_max is null or budget_min is null or budget_max >= budget_min),
  constraint event_dates_are_ordered
    check (event_end_date is null or event_date is null or event_end_date >= event_date)
);

create index quote_requests_requester_idx on quote_requests (requester_id, created_at desc);
create index quote_requests_org_idx on quote_requests (org_id, created_at desc);
create index quote_requests_open_idx on quote_requests (status, city) where status = 'open';

create trigger quote_requests_updated_at
  before update on quote_requests
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Besoins du brief — une ligne par catégorie de prestation
--
-- C'est ce découpage qui rend la comparaison lisible : on compare des traiteurs
-- entre eux, pas un traiteur et un décorateur. D'où l'unicité par catégorie —
-- un même brief ne peut pas ouvrir deux appels d'offres « traiteur ».
-- -----------------------------------------------------------------------------

create table quote_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references quote_requests (id) on delete cascade,
  category_id uuid not null references categories (id) on delete restrict,
  -- Renseignée quand la demande part d'une fiche précise (bouton « Demander un
  -- devis » d'une annonce) ; nulle pour un appel d'offres ouvert.
  listing_id uuid references listings (id) on delete set null,

  quantity integer not null default 1 check (quantity > 0),
  budget_max bigint check (budget_max is null or budget_max >= 0),
  notes text,

  -- Devis retenu. La clé étrangère est posée après la création de `quotes`.
  awarded_quote_id uuid,

  created_at timestamptz not null default now(),

  unique (request_id, category_id)
);

create index quote_request_items_request_idx on quote_request_items (request_id);
create index quote_request_items_category_idx on quote_request_items (category_id);

-- -----------------------------------------------------------------------------
-- Proposition d'un partenaire
-- -----------------------------------------------------------------------------

create table quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,

  item_id uuid not null references quote_request_items (id) on delete cascade,
  org_id uuid not null,
  -- Dupliqué depuis organizations pour la clé étrangère composite ci-dessous.
  -- Rempli par déclencheur : jamais fourni par le client.
  org_type org_type not null default 'partner',
  listing_id uuid references listings (id) on delete set null,

  message text,
  -- Recalculé depuis les lignes par déclencheur. Un total qui ne correspond pas
  -- à son détail est la première cause de litige sur un devis.
  subtotal bigint not null default 0 check (subtotal >= 0),
  currency text not null default 'XOF',
  valid_until date,

  status quote_status not null default 'draft',
  sent_at timestamptz,
  decided_at timestamptz,
  -- Motif du refus, écrit par le client. Sans lui, le partenaire ne progresse pas.
  decline_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (org_id, org_type) references organizations (id, type) on delete cascade,
  constraint quotes_org_is_partner check (org_type = 'partner'),
  -- Une seule proposition par partenaire et par besoin : deux prix du même
  -- prestataire dans le comparateur ne feraient qu'embrouiller le client.
  unique (item_id, org_id)
);

create index quotes_item_idx on quotes (item_id, status);
create index quotes_org_idx on quotes (org_id, status, created_at desc);

create trigger quotes_updated_at
  before update on quotes
  for each row execute function app.set_updated_at();

alter table quote_request_items
  add constraint quote_request_items_awarded_quote_fkey
  foreign key (awarded_quote_id) references quotes (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Détail chiffré d'une proposition
-- -----------------------------------------------------------------------------

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  position integer not null default 0,
  label text not null,
  description text,
  quantity integer not null default 1 check (quantity > 0),
  unit price_unit not null default 'forfait',
  unit_price bigint not null check (unit_price >= 0),
  -- Calculé par la base : l'application ne peut pas se tromper de multiplication.
  line_total bigint generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index quote_lines_quote_idx on quote_lines (quote_id, position);

-- =============================================================================
-- Déclencheurs
-- =============================================================================

-- Références lisibles. Passer par un déclencheur SECURITY DEFINER plutôt que par
-- un DEFAULT : `app.generate_reference` vit dans un schéma révoqué au public,
-- qu'un utilisateur authentifié ne peut pas appeler lui-même.
create or replace function app.set_quote_request_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reference is null then
    new.reference := app.generate_reference('DEM');
  end if;
  return new;
end;
$$;

create trigger quote_requests_reference
  before insert on quote_requests
  for each row execute function app.set_quote_request_reference();

create or replace function app.set_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reference is null then
    new.reference := app.generate_reference('DEV');
  end if;

  -- org_type aligné sur l'organisation visée : l'appelant n'a pas à le
  -- connaître, et surtout ne peut pas mentir dessus.
  select o.type into new.org_type
  from public.organizations o
  where o.id = new.org_id;

  if new.org_type is null then
    raise exception 'Organisation % introuvable', new.org_id;
  end if;

  return new;
end;
$$;

create trigger quotes_reference
  before insert on quotes
  for each row execute function app.set_quote_reference();

-- Total recalculé depuis les lignes, à chaque mouvement de ligne.
create or replace function app.refresh_quote_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := coalesce(new.quote_id, old.quote_id);

  update public.quotes q
  set subtotal = coalesce(
    (select sum(l.line_total) from public.quote_lines l where l.quote_id = target), 0
  )
  where q.id = target;

  return coalesce(new, old);
end;
$$;

create trigger quote_lines_refresh_subtotal
  after insert or update or delete on quote_lines
  for each row execute function app.refresh_quote_subtotal();

-- -----------------------------------------------------------------------------
-- Transitions autorisées
--
-- Les mêmes tables vivent dans `src/lib/states.ts`, côté application, pour
-- afficher les bons boutons. Ici, elles interdisent réellement.
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
    (old.status = 'draft'  and new.status in ('open', 'cancelled'))
    or (old.status = 'open'   and new.status in ('closed', 'awarded', 'cancelled', 'expired'))
    or (old.status = 'closed' and new.status in ('open', 'awarded', 'cancelled'))
  ) then
    raise exception 'Transition % vers % interdite pour une demande de devis.',
      old.status, new.status using errcode = 'check_violation';
  end if;

  if new.status = 'open' and old.status = 'draft' then
    new.published_at := now();
    -- Fenêtre de réponse par défaut : la promesse faite au client.
    new.respond_by := coalesce(new.respond_by, now() + interval '48 hours');
  end if;

  return new;
end;
$$;

create trigger quote_requests_guard_transition
  before update of status on quote_requests
  for each row execute function app.guard_request_transition();

create or replace function app.guard_quote_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- L'acceptation attribue un besoin et en refuse d'autres : elle ne peut pas
  -- se décider par un UPDATE isolé. `public.accept_quote` pose ce drapeau le
  -- temps de sa transaction.
  if new.status = 'accepted'
     and coalesce(current_setting('app.accepting_quote', true), '') <> new.id::text then
    raise exception
      'Un devis ne s''accepte pas directement : passez par accept_quote().'
      using errcode = 'check_violation';
  end if;

  if not (
    (old.status = 'draft' and new.status in ('sent', 'withdrawn'))
    or (old.status = 'sent'
        and new.status in ('accepted', 'declined', 'withdrawn', 'expired'))
  ) then
    raise exception 'Transition % vers % interdite pour un devis.',
      old.status, new.status using errcode = 'check_violation';
  end if;

  if new.status = 'sent' then
    new.sent_at := now();

    if new.subtotal <= 0 then
      raise exception 'Un devis sans montant ne peut pas être envoyé.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status in ('accepted', 'declined') then
    new.decided_at := now();
  end if;

  return new;
end;
$$;

create trigger quotes_guard_transition
  before update of status on quotes
  for each row execute function app.guard_quote_transition();

-- =============================================================================
-- Helpers de visibilité
-- =============================================================================

-- Le demandeur : l'auteur, ou un membre de l'entreprise qui porte la demande.
create or replace function app.owns_request(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_requests r
    where r.id = target
      and (
        r.requester_id = auth.uid()
        or (r.org_id is not null and r.org_id in (select app.user_org_ids()))
      )
  )
$$;

/**
 * Un partenaire voit un besoin ouvert s'il est crédible dessus.
 *
 * Deux façons de l'être : l'annonce est explicitement visée par le client, ou
 * le partenaire exploite une annonce publiée dans la catégorie demandée. La
 * ville doit correspondre pour un lieu — une salle ne se déplace pas — mais pas
 * pour un service, qui peut intervenir ailleurs.
 */
create or replace function app.partner_can_see_item(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_request_items i
    join public.quote_requests r on r.id = i.request_id
    join public.listings l on l.org_id in (select app.user_org_ids())
    where i.id = target
      and r.status in ('open', 'closed', 'awarded')
      and l.status = 'approved'
      and l.is_paused = false
      and (
        i.listing_id = l.id
        or (l.category_id = i.category_id and (l.kind = 'service' or l.city = r.city))
      )
  )
$$;

create or replace function app.partner_can_see_request(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_request_items i
    where i.request_id = target
      and app.partner_can_see_item(i.id)
  )
$$;

-- Un devis est lisible par son auteur, par le client une fois envoyé, et par
-- l'administration. Jamais par un partenaire concurrent.
create or replace function app.can_view_quote(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quotes q
    join public.quote_request_items i on i.id = q.item_id
    where q.id = target
      and (
        q.org_id in (select app.user_org_ids())
        or (q.status <> 'draft' and app.owns_request(i.request_id))
        or app.is_admin()
      )
  )
$$;

create or replace function app.owns_quote(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quotes q
    where q.id = target and q.org_id in (select app.user_org_ids())
  )
$$;

-- =============================================================================
-- Acceptation d'un devis
--
-- Une seule opération, atomique : le devis retenu passe accepté, ses rivaux
-- sont refusés, le besoin est attribué, et la demande bascule si tout est
-- attribué. Découpée côté client, elle laisserait la porte à deux devis
-- acceptés pour un même besoin.
-- =============================================================================

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

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici,
  -- explicitement, sinon n'importe qui pourrait accepter le devis d'autrui.
  if not app.owns_request(v_request) then
    raise exception 'Seul le demandeur peut accepter un devis.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'sent' then
    raise exception 'Seul un devis envoyé peut être accepté (état actuel : %).', v_status
      using errcode = 'check_violation';
  end if;

  perform set_config('app.accepting_quote', target::text, true);

  update public.quotes
  set status = 'accepted'
  where id = target;

  -- Les concurrents sont refusés d'office : laisser un devis « envoyé » sur un
  -- besoin déjà attribué ferait attendre le partenaire pour rien.
  update public.quotes
  set status = 'declined',
      decline_reason = coalesce(decline_reason, 'Une autre proposition a été retenue.')
  where item_id = v_item
    and id <> target
    and status = 'sent';

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

-- =============================================================================
-- RLS
-- =============================================================================

alter table audit_logs enable row level security;
alter table quote_requests enable row level security;
alter table quote_request_items enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;

-- Journal : lecture réservée à l'administration, écriture réservée aux
-- fonctions SECURITY DEFINER (qui, appartenant au propriétaire, ignorent la RLS).
create policy audit_logs_select on audit_logs
  for select using (app.is_admin());

/**
 * Demandes : le client les siennes, le partenaire celles qui le concernent.
 *
 * ⚠️ L'appartenance est écrite **en toutes lettres sur les colonnes de la
 * ligne**, et non déléguée à `app.owns_request(id)`. Une politique SELECT
 * s'applique aussi au `RETURNING` d'un INSERT ; or une fonction `stable` qui
 * relit `quote_requests` ne voit pas encore la ligne en cours d'insertion, et
 * refuserait donc au client sa propre création. Le symptôme est trompeur :
 * « new row violates row-level security policy », comme s'il s'agissait du
 * WITH CHECK de l'INSERT.
 *
 * `partner_can_see_request` interroge d'autres tables : il n'a pas ce défaut.
 */
create policy quote_requests_select on quote_requests
  for select using (
    requester_id = auth.uid()
    or (org_id is not null and org_id in (select app.user_org_ids()))
    or app.is_admin()
    or app.partner_can_see_request(id)
  );

create policy quote_requests_insert on quote_requests
  for insert with check (
    requester_id = auth.uid()
    and (org_id is null or app.is_org_member(org_id))
  );

create policy quote_requests_update on quote_requests
  for update using (app.owns_request(id)) with check (app.owns_request(id));

create policy quote_requests_delete on quote_requests
  for delete using (app.owns_request(id) and status = 'draft');

create policy quote_request_items_select on quote_request_items
  for select using (
    app.owns_request(request_id)
    or app.is_admin()
    or app.partner_can_see_item(id)
  );

create policy quote_request_items_manage on quote_request_items
  for all using (app.owns_request(request_id)) with check (app.owns_request(request_id));

-- Devis : cloisonnement scellé. Un partenaire tiers ne voit rien, et le client
-- ne voit pas les brouillons.
--
-- Comme pour les demandes, l'appartenance est évaluée sur les colonnes de la
-- ligne plutôt que par `app.can_view_quote(id)`, qui relit `quotes` et
-- casserait le `RETURNING` d'un INSERT.
create policy quotes_select on quotes
  for select using (
    org_id in (select app.user_org_ids())
    or (
      status <> 'draft'
      and exists (
        select 1 from quote_request_items i
        where i.id = quotes.item_id and app.owns_request(i.request_id)
      )
    )
    or app.is_admin()
  );

create policy quotes_insert on quotes
  for insert with check (
    org_id in (select app.user_org_ids())
    and app.has_org_role(org_id, array['owner', 'manager', 'staff']::org_role[])
    and app.partner_can_see_item(item_id)
  );

-- Le partenaire modifie son devis ; le client ne touche qu'au statut, et les
-- transitions autorisées sont filtrées par le déclencheur.
create policy quotes_update_partner on quotes
  for update using (app.owns_quote(id)) with check (app.owns_quote(id));

create policy quotes_update_client on quotes
  for update using (
    status <> 'draft'
    and exists (
      select 1 from quote_request_items i
      where i.id = quotes.item_id and app.owns_request(i.request_id)
    )
  ) with check (
    exists (
      select 1 from quote_request_items i
      where i.id = quotes.item_id and app.owns_request(i.request_id)
    )
  );

create policy quotes_delete on quotes
  for delete using (app.owns_quote(id) and status = 'draft');

create policy quote_lines_select on quote_lines
  for select using (app.can_view_quote(quote_id));

-- Les lignes ne bougent plus une fois le devis envoyé : le client compare des
-- montants qui doivent rester ceux qu'on lui a proposés.
create policy quote_lines_manage on quote_lines
  for all using (
    app.owns_quote(quote_id)
    and exists (select 1 from quotes q where q.id = quote_id and q.status = 'draft')
  ) with check (
    app.owns_quote(quote_id)
    and exists (select 1 from quotes q where q.id = quote_id and q.status = 'draft')
  );

-- =============================================================================
-- Privilèges
-- =============================================================================

grant select on audit_logs to authenticated;

grant select, insert, update, delete on
  quote_requests, quote_request_items, quotes, quote_lines
  to authenticated;

grant execute on function public.accept_quote to authenticated;
