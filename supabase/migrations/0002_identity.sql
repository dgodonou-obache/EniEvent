-- =============================================================================
-- 0002 — Identité : profils, organisations, membres, KYC.
--
-- Une organisation est soit une entreprise cliente, soit un partenaire
-- prestataire. Les deux partagent la même mécanique d'équipe (membres, rôles,
-- invitations), ce qui évite de dupliquer tout le module de gestion d'accès.
-- =============================================================================

create type account_type as enum ('particulier', 'entreprise', 'partenaire', 'admin');
create type org_type as enum ('company', 'partner');
create type org_status as enum ('pending', 'active', 'suspended');
create type member_status as enum ('invited', 'active', 'revoked');

-- Union des rôles des deux types d'organisation. La contrainte plus bas
-- garantit qu'un rôle « entreprise » ne peut pas atterrir chez un partenaire.
create type org_role as enum (
  -- entreprise
  'owner', 'admin', 'organizer', 'approver', 'finance', 'viewer',
  -- partenaire
  'manager', 'staff', 'accountant'
);

create type kyc_document_type as enum ('id_card', 'rccm', 'ifu', 'bank_details', 'insurance');
create type kyc_status as enum ('pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'fr',
  country text,
  city text,
  account_type account_type not null default 'particulier',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function app.set_updated_at();

comment on table profiles is
  'Prolonge auth.users. account_type oriente l''utilisateur vers son espace ; '
  'il ne confère aucun droit à lui seul — les droits viennent de organization_members.';

-- Crée le profil dès l''inscription, en reprenant les métadonnées du formulaire.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(
      (new.raw_user_meta_data ->> 'account_type')::public.account_type,
      'particulier'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- Organisations
-- -----------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  type org_type not null,
  legal_name text not null,
  brand_name text,
  slug citext unique,
  -- Registres ouest-africains : RCCM (registre du commerce), IFU/NCC (fiscal).
  rccm text,
  ifu text,
  logo_url text,
  country text not null default 'CI',
  city text,
  address text,
  billing_email citext,
  phone text,
  status org_status not null default 'pending',
  account_manager_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cible de la clé étrangère composite de organization_members : c'est elle
  -- qui rend impossible un rôle d''entreprise dans une organisation partenaire.
  unique (id, type)
);

create index organizations_type_status_idx on organizations (type, status);
create index organizations_account_manager_idx on organizations (account_manager_id)
  where account_manager_id is not null;

create trigger organizations_updated_at
  before update on organizations
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Membres
-- -----------------------------------------------------------------------------

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- Dupliqué depuis organizations pour permettre la contrainte ci-dessous.
  -- Rempli automatiquement par un déclencheur : jamais fourni par le client.
  org_type org_type not null,
  user_id uuid not null references profiles (id) on delete cascade,
  role org_role not null,
  status member_status not null default 'active',
  invited_by uuid references profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, user_id),
  foreign key (org_id, org_type) references organizations (id, type) on delete cascade,

  constraint role_matches_org_type check (
    (org_type = 'company'
      and role in ('owner', 'admin', 'organizer', 'approver', 'finance', 'viewer'))
    or (org_type = 'partner'
      and role in ('owner', 'manager', 'staff', 'accountant'))
  )
);

create index organization_members_user_idx on organization_members (user_id, status);
create index organization_members_org_idx on organization_members (org_id, status);

create trigger organization_members_updated_at
  before update on organization_members
  for each row execute function app.set_updated_at();

-- Aligne org_type sur l''organisation visée, pour que l''appelant n''ait pas à
-- le connaître et surtout ne puisse pas mentir dessus.
create or replace function app.sync_member_org_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select o.type into new.org_type
  from public.organizations o
  where o.id = new.org_id;

  if new.org_type is null then
    raise exception 'Organisation % introuvable', new.org_id;
  end if;

  return new;
end;
$$;

create trigger organization_members_sync_org_type
  before insert or update of org_id on organization_members
  for each row execute function app.sync_member_org_type();

-- -----------------------------------------------------------------------------
-- Helpers de sécurité
--
-- SECURITY DEFINER et propriété postgres : ces fonctions lisent
-- organization_members en contournant la RLS. Sans cela, une politique de
-- organization_members qui interroge organization_members récurserait à l''infini.
-- -----------------------------------------------------------------------------

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'admin'
  )
$$;

create or replace function app.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.organization_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.has_org_role(target_org uuid, allowed org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (allowed)
  )
$$;

create or replace function app.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
$$;

-- -----------------------------------------------------------------------------
-- Profil partenaire & KYC
-- -----------------------------------------------------------------------------

create table partner_profiles (
  org_id uuid primary key references organizations (id) on delete cascade,
  bio text,
  service_cities text[] not null default '{}',
  travel_radius_km integer check (travel_radius_km is null or travel_radius_km >= 0),
  years_experience integer check (years_experience is null or years_experience >= 0),
  -- Statistiques recalculées par déclencheur au fil des devis et des avis :
  -- elles servent au classement des résultats et au matching des demandes.
  response_time_avg_h numeric(6, 2),
  acceptance_rate numeric(5, 2) check (acceptance_rate is null or acceptance_rate between 0 and 100),
  rating_avg numeric(3, 2) check (rating_avg is null or rating_avg between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  -- Taux de commission dérogatoire, en points de pourcentage. NULL = barème standard.
  commission_rate_override numeric(5, 2)
    check (commission_rate_override is null or commission_rate_override between 0 and 100),
  is_verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint verified_has_date check (is_verified = false or verified_at is not null)
);

create trigger partner_profiles_updated_at
  before update on partner_profiles
  for each row execute function app.set_updated_at();

create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  type kyc_document_type not null,
  file_path text not null,
  status kyc_status not null default 'pending',
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rejected_has_reason check (
    status <> 'rejected' or rejection_reason is not null
  )
);

create index kyc_documents_org_idx on kyc_documents (org_id, status);

create trigger kyc_documents_updated_at
  before update on kyc_documents
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Centres de coûts (entreprises)
-- -----------------------------------------------------------------------------

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  name text not null,
  -- Enveloppe en unité mineure (FCFA), cohérente avec src/lib/money.ts.
  budget_amount bigint check (budget_amount is null or budget_amount >= 0),
  currency text not null default 'XOF',
  period_start date,
  period_end date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, code),
  constraint period_is_ordered check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create trigger cost_centers_updated_at
  before update on cost_centers
  for each row execute function app.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table partner_profiles enable row level security;
alter table kyc_documents enable row level security;
alter table cost_centers enable row level security;

-- Profils : chacun le sien. Les administrateurs voient tout.
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or app.is_admin());

create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Organisations : visibles par leurs membres. Un partenaire actif est en outre
-- public — c'est ce qui permet d'afficher « proposé par » sur une annonce.
create policy organizations_select on organizations
  for select using (
    (type = 'partner' and status = 'active')
    or id in (select app.user_org_ids())
    or app.is_admin()
  );

create policy organizations_update_by_admins on organizations
  for update
  using (app.has_org_role(id, array['owner', 'admin']::org_role[]) or app.is_admin())
  with check (app.has_org_role(id, array['owner', 'admin']::org_role[]) or app.is_admin());

-- Membres : on ne voit que l'équipe des organisations dont on fait partie.
create policy organization_members_select on organization_members
  for select using (org_id in (select app.user_org_ids()) or app.is_admin());

create policy organization_members_manage on organization_members
  for all
  using (app.has_org_role(org_id, array['owner', 'admin']::org_role[]) or app.is_admin())
  with check (app.has_org_role(org_id, array['owner', 'admin']::org_role[]) or app.is_admin());

-- Profil partenaire : lisible par tous (vitrine), modifiable par l'équipe.
create policy partner_profiles_select on partner_profiles
  for select using (true);

create policy partner_profiles_manage on partner_profiles
  for all
  using (app.has_org_role(org_id, array['owner', 'manager']::org_role[]) or app.is_admin())
  with check (app.has_org_role(org_id, array['owner', 'manager']::org_role[]) or app.is_admin());

-- KYC : pièces d'identité et coordonnées bancaires. Jamais publiques.
create policy kyc_documents_select on kyc_documents
  for select using (
    app.has_org_role(org_id, array['owner', 'accountant']::org_role[]) or app.is_admin()
  );

create policy kyc_documents_insert on kyc_documents
  for insert
  with check (app.has_org_role(org_id, array['owner', 'accountant']::org_role[]));

-- La décision de validation appartient aux administrateurs : un partenaire ne
-- doit pas pouvoir faire passer son propre dossier en « approved ».
create policy kyc_documents_review on kyc_documents
  for update using (app.is_admin()) with check (app.is_admin());

-- Centres de coûts : réservés à l'entreprise concernée.
create policy cost_centers_select on cost_centers
  for select using (org_id in (select app.user_org_ids()) or app.is_admin());

create policy cost_centers_manage on cost_centers
  for all
  using (app.has_org_role(org_id, array['owner', 'admin', 'finance']::org_role[]) or app.is_admin())
  with check (app.has_org_role(org_id, array['owner', 'admin', 'finance']::org_role[]) or app.is_admin());

-- =============================================================================
-- Privilèges
--
-- La RLS ne filtre que ce à quoi le rôle a déjà accès : sans GRANT, une
-- politique permissive ne sert à rien.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to authenticated, service_role;

grant select on organizations, partner_profiles to anon, authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on
  organizations, organization_members, partner_profiles, kyc_documents, cost_centers
  to authenticated;

grant execute on function app.is_admin, app.user_org_ids, app.has_org_role, app.is_org_member
  to authenticated;
