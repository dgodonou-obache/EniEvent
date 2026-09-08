-- =============================================================================
-- 0003 — Catalogue : catégories, annonces, tarifs, disponibilités.
--
-- Rupture avec la v1 : les tables jumelles `salles` et `prestataires`
-- disparaissent au profit d'une table `listings` unique. Une annonce est un
-- lieu ou un service selon sa catégorie, et les caractéristiques propres à
-- chaque nature vivent dans une table de détail dédiée. Ajouter la décoration,
-- le traiteur ou la location d'équipement ne demande plus une table de plus,
-- seulement une ligne dans `categories`.
-- =============================================================================

create type category_kind as enum ('venue', 'service');
create type booking_mode as enum ('instant', 'quote', 'both');
create type listing_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');
create type availability_slot as enum ('journee', 'matin', 'apres_midi', 'soiree');
create type availability_status as enum ('open', 'closed', 'booked');
create type price_unit as enum ('day', 'half_day', 'hour', 'person', 'item', 'forfait');
create type media_type as enum ('image', 'video');

-- -----------------------------------------------------------------------------
-- Catégories
-- -----------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories (id) on delete restrict,
  kind category_kind not null,
  slug citext not null unique,
  name text not null,
  description text,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cible de la clé étrangère composite de `listings` : garantit qu'une annonce
  -- ne peut pas se déclarer « lieu » tout en pointant une catégorie de service.
  unique (id, kind),
  constraint category_is_not_its_own_parent check (parent_id is distinct from id)
);

create index categories_parent_idx on categories (parent_id);
create index categories_kind_active_idx on categories (kind, is_active);

create trigger categories_updated_at
  before update on categories
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Politiques d'annulation
--
-- Le barème est en base, pas dans le code : c'est lui qui calculera les
-- remboursements, et il doit être figé au moment de la réservation.
-- -----------------------------------------------------------------------------

create table cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  -- Formulation destinée au client, en clair. Règle du projet : jamais
  -- « annulation stricte », toujours « non remboursable ».
  summary text not null,
  created_at timestamptz not null default now()
);

create table cancellation_rules (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references cancellation_policies (id) on delete cascade,
  -- Nombre de jours pleins avant l'événement à partir duquel ce taux s'applique.
  min_days_before integer not null check (min_days_before >= 0),
  refund_percent numeric(5, 2) not null check (refund_percent between 0 and 100),

  unique (policy_id, min_days_before)
);

insert into cancellation_policies (slug, name, summary) values
  ('flexible', 'Flexible',
   'Annulation gratuite jusqu''à 7 jours avant l''événement : vous êtes intégralement remboursé. Ensuite, la moitié du montant reste due.'),
  ('moderee', 'Modérée',
   'Annulation gratuite jusqu''à 30 jours avant l''événement. Entre 30 et 7 jours, la moitié du montant vous est remboursée. Passé ce délai, plus aucun remboursement.'),
  ('ferme', 'Ferme',
   'Un remboursement de moitié est possible jusqu''à 60 jours avant l''événement. Au-delà, le montant reste dû en totalité.'),
  ('non-remboursable', 'Non remboursable',
   'Cette réservation n''est pas remboursable. En cas d''annulation, les sommes versées ne vous seront pas restituées.');

insert into cancellation_rules (policy_id, min_days_before, refund_percent)
select p.id, r.days, r.pct
from cancellation_policies p
join (values
  ('flexible', 7, 100.00), ('flexible', 0, 50.00),
  ('moderee', 30, 100.00), ('moderee', 7, 50.00), ('moderee', 0, 0.00),
  ('ferme', 60, 50.00), ('ferme', 0, 0.00),
  ('non-remboursable', 0, 0.00)
) as r (slug, days, pct) on r.slug = p.slug;

-- -----------------------------------------------------------------------------
-- Annonces
-- -----------------------------------------------------------------------------

create table listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- Colonne constante, présente uniquement pour porter la clé étrangère
  -- composite : une annonce ne peut appartenir qu'à une organisation partenaire.
  org_type org_type not null default 'partner',
  category_id uuid not null,
  kind category_kind not null,

  title text not null check (length(btrim(title)) between 3 and 160),
  slug citext not null unique,
  description text,
  highlights text[] not null default '{}',

  city text not null,
  district text,
  address text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),

  cover_url text,
  currency text not null default 'XOF',

  booking_mode booking_mode not null default 'quote',
  min_notice_days integer not null default 0 check (min_notice_days >= 0),

  -- Prix plancher de sécurité, repris de la v1 : le prestataire ne peut pas
  -- ouvrir une *date* en dessous de ce tarif, ce qui évite les ventes à perte
  -- et les fautes de frappe à un zéro près. En unité mineure (FCFA).
  min_price bigint check (min_price is null or min_price >= 0),
  -- Dénormalisé depuis pricing_rules par déclencheur, pour trier le catalogue
  -- sans jointure ni agrégat à chaque recherche.
  --
  -- Attention : `price_from` et `min_price` ne mesurent pas la même chose et ne
  -- doivent pas être comparés. Le premier est le plus petit tarif affiché, tous
  -- unités confondues (12 000 FCFA *par personne*) ; le second est un plancher
  -- sur le tarif d'une journée (500 000 FCFA). Les contraindre l'un par l'autre
  -- rendrait impossible toute annonce facturée à la personne.
  price_from bigint check (price_from is null or price_from >= 0),

  cancellation_policy_id uuid references cancellation_policies (id) on delete restrict,
  payment_terms text,

  -- Cycle de modération. Seul un administrateur peut accorder `approved`
  -- ou `rejected` (déclencheur plus bas).
  status listing_status not null default 'draft',
  moderation_notes text,
  published_at timestamptz,
  -- Mise en pause décidée par le partenaire : distincte de la modération, pour
  -- qu'une remise en ligne ne repasse pas par une validation.
  is_paused boolean not null default false,

  rating_avg numeric(3, 2) check (rating_avg is null or rating_avg between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),

  seo_title text,
  seo_description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint listings_org_is_partner check (org_type = 'partner'),
  foreign key (org_id, org_type) references organizations (id, type) on delete cascade,
  foreign key (category_id, kind) references categories (id, kind) on delete restrict,
  unique (id, org_id)
);

create index listings_org_idx on listings (org_id, status);
create index listings_category_idx on listings (category_id) where status = 'approved';
create index listings_city_idx on listings (city) where status = 'approved';
create index listings_published_idx on listings (status, is_paused, published_at desc);
create index listings_title_trgm_idx on listings using gin (title gin_trgm_ops);

create trigger listings_updated_at
  before update on listings
  for each row execute function app.set_updated_at();

-- Publication et modération
create or replace function app.guard_listing_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le garde-fou vise l'utilisateur authentifié qui tenterait de se valider
  -- lui-même. En l'absence de session (migration, seed, tâche planifiée passant
  -- par la clé de service), il ne s'applique pas : ces écritures sont déjà
  -- restreintes par les privilèges, pas par la RLS.
  if auth.uid() is not null and not app.is_admin() then
    if tg_op = 'UPDATE'
       and new.status is distinct from old.status
       and new.status in ('approved', 'rejected')
    then
      raise exception 'Seul un administrateur peut passer une annonce en %.', new.status
        using errcode = 'insufficient_privilege';
    end if;

    if tg_op = 'INSERT' and new.status in ('approved', 'rejected') then
      raise exception 'Une annonce ne peut pas être créée directement en %.', new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Horodate la première publication, et seulement la première.
  if new.status = 'approved' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger listings_guard_moderation
  before insert or update on listings
  for each row execute function app.guard_listing_moderation();

-- -----------------------------------------------------------------------------
-- Détails propres à chaque nature
-- -----------------------------------------------------------------------------

create table venue_details (
  listing_id uuid primary key references listings (id) on delete cascade,
  capacity_seated integer check (capacity_seated is null or capacity_seated >= 0),
  capacity_standing integer check (capacity_standing is null or capacity_standing >= 0),
  capacity_cocktail integer check (capacity_cocktail is null or capacity_cocktail >= 0),
  surface_m2 integer check (surface_m2 is null or surface_m2 > 0),
  layouts text[] not null default '{}',
  parking_spots integer check (parking_spots is null or parking_spots >= 0),
  has_outdoor_space boolean not null default false,
  has_kitchen boolean not null default false,
  accessibility_pmr boolean not null default false,
  external_caterer_allowed boolean not null default true,
  alcohol_allowed boolean not null default true,
  -- Heure au-delà de laquelle la musique doit cesser. Motif récurrent de litige :
  -- mieux vaut l'afficher que le découvrir le soir même.
  noise_curfew_hour smallint check (noise_curfew_hour is null or noise_curfew_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger venue_details_updated_at
  before update on venue_details
  for each row execute function app.set_updated_at();

create table venue_spaces (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  name text not null,
  capacity integer check (capacity is null or capacity >= 0),
  surface_m2 integer check (surface_m2 is null or surface_m2 > 0),
  base_price bigint check (base_price is null or base_price >= 0),
  sort_order integer not null default 0,

  unique (listing_id, name)
);

create table service_details (
  listing_id uuid primary key references listings (id) on delete cascade,
  min_guests integer check (min_guests is null or min_guests >= 0),
  max_guests integer check (max_guests is null or max_guests >= 0),
  travel_radius_km integer check (travel_radius_km is null or travel_radius_km >= 0),
  travel_fee_per_km bigint check (travel_fee_per_km is null or travel_fee_per_km >= 0),
  setup_time_min integer check (setup_time_min is null or setup_time_min >= 0),
  teardown_time_min integer check (teardown_time_min is null or teardown_time_min >= 0),
  -- Caractéristiques spécifiques au métier (nombre de platines, type de cuisine,
  -- langues du maître de cérémonie…). Trop variables pour être colonnisées.
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guests_range_is_ordered check (
    min_guests is null or max_guests is null or min_guests <= max_guests
  )
);

create trigger service_details_updated_at
  before update on service_details
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Médias, équipements, options
-- -----------------------------------------------------------------------------

create table listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  type media_type not null default 'image',
  storage_path text not null,
  alt text,
  position integer not null default 0,
  created_at timestamptz not null default now(),

  unique (listing_id, position)
);

create index listing_media_listing_idx on listing_media (listing_id, position);

create table amenities (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  icon text,
  applies_to category_kind,
  sort_order integer not null default 0
);

create table listing_amenities (
  listing_id uuid not null references listings (id) on delete cascade,
  amenity_id uuid not null references amenities (id) on delete cascade,
  primary key (listing_id, amenity_id)
);

create table listing_options (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  label text not null,
  description text,
  price bigint not null check (price >= 0),
  unit price_unit not null default 'forfait',
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  is_required boolean not null default false,
  sort_order integer not null default 0,

  unique (listing_id, label)
);

-- -----------------------------------------------------------------------------
-- Tarification
-- -----------------------------------------------------------------------------

create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  unit price_unit not null,
  base_price bigint not null check (base_price >= 0),
  min_duration integer not null default 1 check (min_duration >= 1),
  -- Majoration week-end exprimée en multiplicateur (1.25 = +25 %).
  weekend_multiplier numeric(4, 2) not null default 1
    check (weekend_multiplier between 0.1 and 10),
  season_start date,
  season_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint season_is_ordered check (
    season_start is null or season_end is null or season_start <= season_end
  )
);

create index pricing_rules_listing_idx on pricing_rules (listing_id);

create trigger pricing_rules_updated_at
  before update on pricing_rules
  for each row execute function app.set_updated_at();

-- Maintient listings.price_from : « à partir de X » affiché au catalogue.
create or replace function app.refresh_price_from()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
  set price_from = (
    select min(p.base_price) from public.pricing_rules p where p.listing_id = target
  )
  where l.id = target;

  return null;
end;
$$;

create trigger pricing_rules_refresh_price_from
  after insert or update or delete on pricing_rules
  for each row execute function app.refresh_price_from();

-- -----------------------------------------------------------------------------
-- Disponibilités
-- -----------------------------------------------------------------------------

create table availabilities (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  date date not null,
  slot availability_slot not null default 'journee',
  status availability_status not null default 'open',
  -- Tarif du jour. Prime sur pricing_rules : c'est ce que le partenaire saisit
  -- dans son planning.
  price bigint check (price is null or price >= 0),
  inventory integer not null default 1 check (inventory >= 0),
  capacity_used integer not null default 0 check (capacity_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (listing_id, date, slot),
  constraint inventory_not_oversold check (capacity_used <= inventory)
);

create index availabilities_listing_date_idx on availabilities (listing_id, date);
create index availabilities_open_idx on availabilities (date, status)
  where status = 'open';

create trigger availabilities_updated_at
  before update on availabilities
  for each row execute function app.set_updated_at();

-- Prix plancher : reprise de la règle métier de la v1, mais côté base plutôt
-- que côté interface. Une saisie à 15 000 au lieu de 150 000 est rejetée, quelle
-- que soit la voie d'écriture — formulaire, import en masse ou appel direct.
create or replace function app.enforce_min_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  floor_price bigint;
begin
  if new.price is null or new.status <> 'open' then
    return new;
  end if;

  select l.min_price into floor_price from public.listings l where l.id = new.listing_id;

  if floor_price is not null and new.price < floor_price then
    raise exception
      'Tarif % inférieur au prix plancher % défini pour cette annonce.', new.price, floor_price
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger availabilities_enforce_min_price
  before insert or update of price, status on availabilities
  for each row execute function app.enforce_min_price();

-- =============================================================================
-- Helpers de visibilité
-- =============================================================================

-- Une annonce est publique si elle est validée, non mise en pause, et portée
-- par une organisation active.
create or replace function app.listing_is_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.organizations o on o.id = l.org_id
    where l.id = target
      and l.status = 'approved'
      and l.is_paused = false
      and o.status = 'active'
  )
$$;

create or replace function app.can_view_listing(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.listing_is_public(target)
     or app.is_admin()
     or exists (
       select 1 from public.listings l
       where l.id = target and app.is_org_member(l.org_id)
     )
$$;

create or replace function app.can_edit_listing(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
     or exists (
       select 1 from public.listings l
       where l.id = target
         and app.has_org_role(l.org_id, array['owner', 'manager']::public.org_role[])
     )
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table categories enable row level security;
alter table cancellation_policies enable row level security;
alter table cancellation_rules enable row level security;
alter table listings enable row level security;
alter table venue_details enable row level security;
alter table venue_spaces enable row level security;
alter table service_details enable row level security;
alter table listing_media enable row level security;
alter table amenities enable row level security;
alter table listing_amenities enable row level security;
alter table listing_options enable row level security;
alter table pricing_rules enable row level security;
alter table availabilities enable row level security;

-- Référentiels : lecture ouverte, écriture réservée aux administrateurs.
create policy categories_select on categories for select using (true);
create policy categories_manage on categories for all
  using (app.is_admin()) with check (app.is_admin());

create policy cancellation_policies_select on cancellation_policies for select using (true);
create policy cancellation_policies_manage on cancellation_policies for all
  using (app.is_admin()) with check (app.is_admin());

create policy cancellation_rules_select on cancellation_rules for select using (true);
create policy cancellation_rules_manage on cancellation_rules for all
  using (app.is_admin()) with check (app.is_admin());

create policy amenities_select on amenities for select using (true);
create policy amenities_manage on amenities for all
  using (app.is_admin()) with check (app.is_admin());

-- Annonces : publiques une fois validées ; le partenaire voit et modifie
-- les siennes quel que soit leur état.
create policy listings_select on listings
  for select using (
    (status = 'approved' and is_paused = false)
    or org_id in (select app.user_org_ids())
    or app.is_admin()
  );

create policy listings_insert on listings
  for insert with check (
    app.has_org_role(org_id, array['owner', 'manager']::org_role[])
  );

create policy listings_update on listings
  for update
  using (
    app.has_org_role(org_id, array['owner', 'manager']::org_role[]) or app.is_admin()
  )
  with check (
    app.has_org_role(org_id, array['owner', 'manager']::org_role[]) or app.is_admin()
  );

create policy listings_delete on listings
  for delete using (
    app.has_org_role(org_id, array['owner']::org_role[]) or app.is_admin()
  );

-- Tables filles : la visibilité suit celle de l'annonce parente.
do $$
declare
  child text;
begin
  foreach child in array array[
    'venue_details', 'venue_spaces', 'service_details',
    'listing_media', 'listing_amenities', 'listing_options',
    'pricing_rules', 'availabilities'
  ]
  loop
    execute format(
      'create policy %1$s_select on %1$I for select using (app.can_view_listing(listing_id))',
      child
    );
    execute format(
      'create policy %1$s_manage on %1$I for all
         using (app.can_edit_listing(listing_id))
         with check (app.can_edit_listing(listing_id))',
      child
    );
  end loop;
end
$$;

-- =============================================================================
-- Privilèges
-- =============================================================================

grant select on
  categories, cancellation_policies, cancellation_rules, amenities,
  listings, venue_details, venue_spaces, service_details,
  listing_media, listing_amenities, listing_options, pricing_rules, availabilities
  to anon, authenticated;

grant insert, update, delete on
  categories, cancellation_policies, cancellation_rules, amenities,
  listings, venue_details, venue_spaces, service_details,
  listing_media, listing_amenities, listing_options, pricing_rules, availabilities
  to authenticated;

grant execute on function
  app.listing_is_public, app.can_view_listing, app.can_edit_listing
  to anon, authenticated;
