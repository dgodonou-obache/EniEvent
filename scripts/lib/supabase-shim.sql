-- =============================================================================
-- Reproduction locale de ce que Supabase fournit avant nos migrations.
--
-- Ce fichier n'est JAMAIS poussé en production : il n'existe que pour exécuter
-- les migrations dans un Postgres nu (PGlite) et y tester la RLS. Les objets
-- recréés ici sont ceux dont dépendent nos migrations : le schéma `auth`, la
-- table `auth.users`, les fonctions `auth.uid()` / `auth.role()` / `auth.jwt()`,
-- et les trois rôles de PostgREST.
-- =============================================================================

create schema if not exists auth;

-- Rôles PostgREST. `anon` pour le visiteur, `authenticated` pour l'utilisateur
-- connecté, `service_role` pour les webhooks (contourne la RLS via bypassrls).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Version simplifiée de auth.users : seules les colonnes que notre schéma
-- référence réellement.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mêmes définitions que Supabase : la revendication peut arriver soit
-- décomposée (`request.jwt.claim.sub`), soit sous forme de JSON complet
-- (`request.jwt.claims`). Les deux doivent fonctionner.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      auth.jwt() ->> 'sub'
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role',
    'anon'
  )
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    auth.jwt() ->> 'email'
  )
$$;

-- Droits accordés par Supabase : les politiques RLS appellent auth.uid() avec
-- les privilèges de l'appelant, donc anon et authenticated doivent pouvoir
-- traverser le schéma auth et exécuter ces fonctions. La table auth.users, elle,
-- reste inaccessible.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- =============================================================================
-- Stockage
--
-- Réduit à ce dont nos politiques ont besoin : les seaux, les objets, et
-- `storage.foldername`, qui découpe un chemin en dossiers. C'est sur le premier
-- dossier que repose tout le cloisonnement des photos — un partenaire n'écrit
-- que sous l'identifiant de son organisation. Le reproduire ici permet de le
-- vérifier dans PGlite, plutôt que de l'espérer.
-- =============================================================================

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Même sémantique que Supabase : les dossiers, sans le nom de fichier.
-- « org/annonce/photo.jpg » donne { org, annonce }.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername to anon, authenticated;
