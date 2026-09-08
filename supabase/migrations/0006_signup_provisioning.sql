-- =============================================================================
-- 0006 — Approvisionnement à l'inscription.
--
-- Créer l'organisation depuis le client après `signUp` ne marche pas : quand la
-- confirmation d'e-mail est active, l'inscription ne rend aucune session, donc
-- aucune écriture n'est possible sous RLS. Et le faire plus tard, à la première
-- connexion, laisse une fenêtre où le compte existe sans son organisation.
--
-- On étend donc le déclencheur qui crée déjà le profil : profil, organisation,
-- appartenance et fiche partenaire naissent dans la même transaction que le
-- compte. Soit tout existe, soit rien.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Slugs
-- -----------------------------------------------------------------------------

-- `unaccent` est une extension que l'on préfère ne pas imposer : on retire les
-- diacritiques les plus courants du français à la main.
create or replace function app.unaccent_or_self(value text)
returns text
language sql
immutable
as $$
  select translate(
    value,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  )
$$;

create or replace function app.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(lower(app.unaccent_or_self(value)), '[^a-z0-9]+', '-', 'g')
  )
$$;

-- Ajoute un suffixe numérique tant que le slug est pris. Deux « Traiteur
-- Délice » peuvent légitimement exister dans deux villes différentes.
create or replace function app.unique_org_slug(base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate text := nullif(app.slugify(base), '');
  suffix integer := 1;
begin
  if candidate is null then
    candidate := 'organisation';
  end if;

  while exists (select 1 from public.organizations o where o.slug = candidate) loop
    suffix := suffix + 1;
    candidate := app.slugify(base) || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

-- -----------------------------------------------------------------------------
-- Création du compte
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

  -- Un particulier n'a pas d'organisation : on s'arrête là.
  if chosen_account_type not in ('partenaire', 'entreprise') or company_name is null then
    return new;
  end if;

  new_org_type := case when chosen_account_type = 'partenaire' then 'partner' else 'company' end;

  insert into public.organizations (type, legal_name, slug, status, country, city, phone, billing_email)
  values (
    new_org_type,
    company_name,
    app.unique_org_slug(company_name),
    -- Active d'emblée : le partenaire doit pouvoir compléter son dossier et
    -- déposer ses pièces. Ce qui reste verrouillé, c'est la publication de ses
    -- annonces (modération) et le badge « vérifié » (KYC).
    'active',
    -- `country` est NOT NULL : passer explicitement NULL écraserait la valeur
    -- par défaut de la colonne au lieu de la laisser s'appliquer.
    coalesce(nullif(btrim(meta ->> 'country'), ''), 'CI'),
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

comment on function app.handle_new_user is
  'Crée profil, organisation, appartenance et fiche partenaire dans la même '
  'transaction que le compte auth. Ignore un account_type « admin » demandé '
  'par le client.';
