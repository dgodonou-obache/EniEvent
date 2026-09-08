-- =============================================================================
-- 0007 — Recentrage sur le Bénin.
--
-- Le produit s'adresse au Bénin, pas à « l'Afrique de l'Ouest » : le pays par
-- défaut change, et les villes deviennent un référentiel plutôt qu'un champ
-- texte libre — sans quoi « Cotonou », « cotonou » et « Cotonou  » seraient
-- trois villes différentes dans les filtres de recherche.
--
-- Le schéma reste multi-pays : `organizations.country` et `cities.country`
-- existent toujours. Ouvrir le Togo ou le Nigeria demandera des données, pas
-- une migration.
-- =============================================================================

alter table organizations alter column country set default 'BJ';

-- -----------------------------------------------------------------------------
-- Référentiel des villes
-- -----------------------------------------------------------------------------

create table cities (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  country text not null default 'BJ',
  -- Département au Bénin. Le mot « region » reste générique pour les pays
  -- voisins, dont le découpage administratif porte un autre nom.
  region text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cities_country_active_idx on cities (country, is_active, sort_order);
create index cities_name_trgm_idx on cities using gin (name gin_trgm_ops);

create trigger cities_updated_at
  before update on cities
  for each row execute function app.set_updated_at();

comment on table cities is
  'Villes ouvertes à la recherche. Les coordonnées alimentent la vue carte et, '
  'plus tard, le tri par proximité.';

insert into cities (slug, name, region, latitude, longitude, sort_order) values
  ('cotonou',       'Cotonou',        'Littoral',   6.370300, 2.391200, 10),
  ('abomey-calavi', 'Abomey-Calavi',  'Atlantique', 6.448500, 2.355600, 20),
  ('porto-novo',    'Porto-Novo',     'Ouémé',      6.496900, 2.628900, 30),
  ('seme-podji',    'Sèmè-Podji',     'Ouémé',      6.366700, 2.633300, 40),
  ('ouidah',        'Ouidah',         'Atlantique', 6.362800, 2.085200, 50),
  ('grand-popo',    'Grand-Popo',     'Mono',       6.283300, 1.823600, 60),
  ('bohicon',       'Bohicon',        'Zou',        7.178200, 2.066700, 70),
  ('abomey',        'Abomey',         'Zou',        7.182600, 1.991200, 80),
  ('parakou',       'Parakou',        'Borgou',     9.337200, 2.630300, 90),
  ('djougou',       'Djougou',        'Donga',      9.708500, 1.666000, 100),
  ('natitingou',    'Natitingou',     'Atacora',   10.304200, 1.379600, 110)
on conflict (slug) do nothing;

alter table cities enable row level security;

create policy cities_select on cities for select using (true);
create policy cities_manage on cities for all
  using (app.is_admin()) with check (app.is_admin());

grant select on cities to anon, authenticated;
grant insert, update, delete on cities to authenticated;

-- -----------------------------------------------------------------------------
-- Approvisionnement à l'inscription : le pays de repli devient le Bénin
--
-- Redéfinition complète de la fonction introduite en 0006 : seule la valeur de
-- repli change, mais PostgreSQL ne permet pas de modifier une ligne d'un corps
-- de fonction.
-- -----------------------------------------------------------------------------

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen_account_type public.account_type;
  company_name text := nullif(btrim(meta ->> 'company_name'), '');
  new_org_id uuid;
  new_org_type public.org_type;
begin
  chosen_account_type := coalesce(
    (meta ->> 'account_type')::public.account_type,
    'particulier'
  );

  -- Le type de compte « admin » ne s'obtient jamais par inscription : il se
  -- confère depuis le back-office. Sans ce garde-fou, n'importe qui pourrait
  -- s'octroyer les droits d'administration en trafiquant les métadonnées
  -- envoyées au formulaire d'inscription.
  if chosen_account_type = 'admin' then
    chosen_account_type := 'particulier';
  end if;

  insert into public.profiles (id, full_name, phone, account_type, city, country)
  values (
    new.id,
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(meta ->> 'phone'), ''),
    chosen_account_type,
    nullif(btrim(meta ->> 'city'), ''),
    nullif(btrim(meta ->> 'country'), '')
  )
  on conflict (id) do nothing;

  if chosen_account_type not in ('partenaire', 'entreprise') or company_name is null then
    return new;
  end if;

  new_org_type := case when chosen_account_type = 'partenaire' then 'partner' else 'company' end;

  insert into public.organizations (type, legal_name, slug, status, country, city, phone, billing_email)
  values (
    new_org_type,
    company_name,
    app.unique_org_slug(company_name),
    'active',
    -- `country` est NOT NULL : passer explicitement NULL écraserait la valeur
    -- par défaut de la colonne au lieu de la laisser s'appliquer.
    coalesce(nullif(btrim(meta ->> 'country'), ''), 'BJ'),
    nullif(btrim(meta ->> 'city'), ''),
    nullif(btrim(meta ->> 'phone'), ''),
    new.email
  )
  returning id into new_org_id;

  insert into public.organization_members (org_id, org_type, user_id, role, status, joined_at)
  values (new_org_id, new_org_type, new.id, 'owner', 'active', now());

  if new_org_type = 'partner' then
    insert into public.partner_profiles (org_id, service_cities)
    values (
      new_org_id,
      case
        when nullif(btrim(meta ->> 'city'), '') is null then '{}'::text[]
        else array[btrim(meta ->> 'city')]
      end
    );
  end if;

  return new;
end;
$$;
