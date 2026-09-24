-- =============================================================================
-- 0040 — Administration : comptes, référentiel, interrupteurs
--
-- Le lot C ouvre le back-office d'exploitation. Presque tout s'appuie sur des
-- tables et des politiques déjà en place : `categories` et `cities` ont depuis
-- l'origine une politique `manage` réservée à `app.is_admin()`, `audit_logs`
-- une politique de lecture du même ordre. Rien à refaire de ce côté.
--
-- Quatre manques, et un seul d'entre eux est une table :
--
--   1. L'administration ne peut pas lire les adresses e-mail. `profiles` n'en
--      porte aucune — elles vivent dans `auth.users`, hors de portée de
--      PostgREST. Un écran « Utilisateurs » sans adresse est inutilisable :
--      c'est par l'adresse qu'on identifie quelqu'un qui écrit au support.
--
--   2. `profiles.account_type` n'est **écrit par personne**. La migration 0021
--      l'a retiré du `grant update` après qu'un simple utilisateur se soit
--      promu `admin` en un appel. ⚠️ Un administrateur est lui aussi
--      `authenticated` : le droit de colonne ne sait pas les distinguer, et un
--      `update` direct ne lèverait rien en touchant zéro ligne. Seule une
--      fonction `security definer` qui interroge `app.is_admin()` peut trancher.
--
--   3. `organizations.status` est dans le même cas, et pour la même raison —
--      c'était la troisième élévation de privilèges de 0021.
--
--   4. Les interrupteurs de fonctionnalité n'existent pas.
--
-- ⚠️ **Un interrupteur qui ne commande rien est pire que pas d'interrupteur.**
-- L'exploitant le bascule, croit avoir agi, et le produit continue comme avant.
-- Cette migration n'en crée donc que deux, et les deux sont **appliqués par des
-- déclencheurs sur les tables**, pas dans l'interface ni en tête des fonctions
-- d'écriture :
--
--   `inscriptions_partenaires` → déclencheur sur `organizations`
--   `messagerie`               → déclencheurs sur `conversations` et `messages`
--
-- Garder l'entrée de la table plutôt que celle des fonctions couvre **tous**
-- les chemins. `conversations` en a trois — `open_conversation`,
-- `open_conversation_for_request` et une éventuelle correction manuelle — et un
-- interrupteur qui ferme deux portes sur trois ne ferme rien.
--
-- En ajouter un troisième demande d'écrire d'abord l'endroit qui lui obéit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Interrupteurs de fonctionnalité
-- -----------------------------------------------------------------------------

create table if not exists feature_flags (
  key text primary key,
  -- Ce que l'exploitant lit à l'écran. En clair, comme partout (§5 du guide) :
  -- « Inscriptions partenaires », pas « partner_signup_enabled ».
  label text not null,
  -- Ce que couper provoque réellement. Sans cette phrase, personne n'ose
  -- toucher l'interrupteur — ou pire, quelqu'un l'ose sans savoir.
  description text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);

comment on table feature_flags is
  'Interrupteurs d''exploitation. Chaque clé est obéie par du code réel : '
  'en ajouter une sans écrire l''endroit qui la lit crée un faux tableau de bord.';

drop trigger if exists feature_flags_updated_at on feature_flags;
create trigger feature_flags_updated_at
  before update on feature_flags
  for each row execute function app.set_updated_at();

alter table feature_flags enable row level security;

-- Lisible par tous : le site doit savoir, sans session, qu'une inscription est
-- fermée. Une clé et un libellé ne révèlent rien qu'un visiteur ne constate en
-- essayant.
drop policy if exists feature_flags_select on feature_flags;
create policy feature_flags_select on feature_flags for select using (true);

-- L'écriture ne passe que par `set_feature_flag`. La politique existe pour que
-- `db:verify` trouve une politique, et pour qu'un administrateur reste couvert
-- si une correction manuelle s'impose un jour.
drop policy if exists feature_flags_manage on feature_flags;
create policy feature_flags_manage on feature_flags for all
  using (app.is_admin()) with check (app.is_admin());

grant select on feature_flags to anon, authenticated;
-- Pas de `grant insert, update, delete` : la colonne `enabled` **est** un
-- privilège. Elle suit donc la règle des colonnes sensibles — fonction dédiée,
-- jamais un droit de table (§3 du guide).
revoke insert, update, delete on feature_flags from anon, authenticated;

insert into feature_flags (key, label, description) values
  ('inscriptions_partenaires', 'Inscriptions partenaires',
   'Ouvre ou ferme la création de comptes partenaires. Fermé, /pro/inscription '
   'refuse avec un message clair ; les partenaires déjà inscrits ne sont pas affectés.'),
  ('messagerie', 'Messagerie',
   'Autorise l''ouverture de fils et l''envoi de messages entre clients et '
   'prestataires. Coupée, les fils existants restent lisibles mais personne '
   'ne peut plus écrire.')
on conflict (key) do nothing;

/**
 * L'interrupteur, lu depuis SQL.
 *
 * `stable` et non `immutable` : la valeur change en cours de vie du produit,
 * c'est tout son objet. Une clé absente vaut **vrai** — un interrupteur qu'on
 * n'a pas posé ne doit pas éteindre une fonctionnalité qui marchait.
 */
create or replace function app.feature_enabled(cle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = cle), true);
$$;

create or replace function public.set_feature_flag(cle text, actif boolean)
returns public.feature_flags
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.feature_flags;
  ancien boolean;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  select f.enabled into ancien from public.feature_flags f where f.key = cle;

  update public.feature_flags
  set enabled = actif, updated_by = auth.uid()
  where key = cle
  returning * into ligne;

  -- Un `update` bloqué ne lève rien : il touche zéro ligne. Sans ce contrôle,
  -- l'écran annoncerait un interrupteur basculé qui ne l'est pas.
  if ligne.key is null then
    raise exception 'Interrupteur inconnu : %', cle using errcode = 'no_data_found';
  end if;

  perform app.log_event('feature_flag', null, 'set', ancien::text, actif::text,
    jsonb_build_object('cle', cle, 'actif', actif));

  return ligne;
end;
$$;

revoke execute on function public.set_feature_flag(text, boolean) from public, anon;
grant execute on function public.set_feature_flag(text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Les comptes, vus par l'administration
-- -----------------------------------------------------------------------------

/**
 * La liste des utilisateurs, adresse comprise.
 *
 * ⚠️ **`auth.users` n'est pas exposé par PostgREST**, et c'est voulu : cette
 * table porte les empreintes de mots de passe et les jetons de récupération.
 * On n'y ouvre donc pas un droit de lecture — on en extrait ici les quatre
 * colonnes dont l'administration a besoin, derrière `app.is_admin()`.
 *
 * `email_confirmed_at` est la plus utile des quatre : une inscription qui
 * n'aboutit jamais se voit à ce champ resté nul, et c'est le premier symptôme
 * d'un problème d'acheminement du courrier.
 */
create or replace function public.admin_users(
  recherche text default null,
  limite integer default 50,
  decalage integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  account_type public.account_type,
  email_confirmed boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  org_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.phone,
    p.account_type,
    u.email_confirmed_at is not null,
    u.last_sign_in_at,
    p.created_at,
    (select count(*)::integer from public.organization_members m
      where m.user_id = p.id and m.status = 'active')
  from public.profiles p
  join auth.users u on u.id = p.id
  where recherche is null
     or btrim(recherche) = ''
     or p.full_name ilike '%' || btrim(recherche) || '%'
     or u.email ilike '%' || btrim(recherche) || '%'
     or p.phone ilike '%' || btrim(recherche) || '%'
  order by p.created_at desc
  limit greatest(1, least(coalesce(limite, 50), 200))
  offset greatest(0, coalesce(decalage, 0));
end;
$$;

revoke execute on function public.admin_users(text, integer, integer) from public, anon;
grant execute on function public.admin_users(text, integer, integer) to authenticated;

/**
 * Les entreprises clientes, coordonnées comprises.
 *
 * ⚠️ **On ne peut pas lire `organizations` colonne par colonne ici.** La
 * migration 0036 a fermé l'annuaire : `revoke select on organizations`, puis un
 * `grant` sur les seules colonnes de vitrine. `billing_email` et `phone` en
 * sont **volontairement absents** — c'était tout l'objet de 0036, qui a fermé
 * un annuaire téléphonique lisible sans connexion.
 *
 * Un administrateur est `authenticated` comme les autres : une requête directe
 * lui répond `permission denied`, et c'est exactement ce qui est arrivé au
 * premier jet de cet écran. Le chemin prévu est une fonction `security
 * definer`, comme `org_contact` pour une organisation seule.
 *
 * L'embarquement du nombre de membres passe aussi par ici : `organization_members`
 * pointe `organizations` par une clé **composite** `(org_id, org_type)`, que
 * PostgREST ne sait pas suivre pour un simple `count`.
 */
create or replace function public.admin_companies()
returns table (
  org_id uuid,
  legal_name text,
  brand_name text,
  city text,
  status public.org_status,
  billing_email text,
  phone text,
  member_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    o.id,
    o.legal_name,
    o.brand_name,
    o.city,
    o.status,
    -- ⚠️ `billing_email` est un `citext`, pas un `text`. Sans ce transtypage,
    -- Postgres refuse avec « structure of query does not match function result
    -- type » — un message qui ne nomme pas la colonne fautive, et qui ne se
    -- manifeste qu'à l'appel. Même piège que `auth.users.email` plus haut.
    o.billing_email::text,
    o.phone,
    (select count(*)::integer from public.organization_members m
      where m.org_id = o.id and m.status = 'active'),
    o.created_at
  from public.organizations o
  where o.type = 'company'
  order by o.created_at desc;
end;
$$;

revoke execute on function public.admin_companies() from public, anon;
grant execute on function public.admin_companies() to authenticated;

/**
 * Changer le type de compte de quelqu'un.
 *
 * ⚠️ **Deux verrous, et le second n'est pas de la précaution décorative.**
 *
 * Un administrateur qui se retire à lui-même le type `admin` ferme la porte
 * derrière lui : `/admin` est refusé dans le proxy, il ne peut donc plus se
 * rendre sur l'écran qui l'y remettrait. Et si c'était le dernier, plus
 * personne au monde ne le peut — la seule sortie serait une requête SQL sur le
 * projet Supabase. On refuse donc les deux cas, en le disant.
 */
create or replace function public.set_account_type(cible uuid, nouveau public.account_type)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.profiles;
  ancien public.account_type;
  restants integer;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  select p.account_type into ancien from public.profiles p where p.id = cible;

  if ancien is null then
    raise exception 'Compte introuvable.' using errcode = 'no_data_found';
  end if;

  if ancien = nouveau then
    raise exception 'Ce compte est déjà de type « % ».', nouveau using errcode = 'check_violation';
  end if;

  if cible = auth.uid() and nouveau <> 'admin' then
    raise exception 'On ne retire pas son propre accès à l''administration : vous ne pourriez plus revenir sur cet écran.'
      using errcode = 'check_violation';
  end if;

  if ancien = 'admin' and nouveau <> 'admin' then
    select count(*)::integer into restants
    from public.profiles p where p.account_type = 'admin' and p.id <> cible;

    if restants = 0 then
      raise exception 'C''est le dernier compte d''administration : le retirer fermerait le back-office à tout le monde.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.profiles
  set account_type = nouveau, updated_at = now()
  where id = cible
  returning * into ligne;

  perform app.log_event('profile', cible, 'set_account_type', ancien::text, nouveau::text,
    jsonb_build_object('cible', cible));

  return ligne;
end;
$$;

revoke execute on function public.set_account_type(uuid, public.account_type) from public, anon;
grant execute on function public.set_account_type(uuid, public.account_type) to authenticated;

/**
 * Suspendre ou réactiver une organisation.
 *
 * `organizations_update_by_admins` autorise bien la **ligne**, mais 0021 a
 * retiré `status` du `grant update` de `authenticated` — et l'administrateur en
 * fait partie. L'écriture n'a donc aucun chemin sans cette fonction.
 *
 * Suspendre un partenaire le retire du catalogue public : `organizations_select`
 * ne rend un partenaire que `status = 'active'`. C'est l'outil de réponse à un
 * signalement, et il agit tout de suite.
 */
create or replace function public.set_org_status(org uuid, nouveau public.org_status)
returns public.organizations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.organizations;
  ancien public.org_status;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  select o.status into ancien from public.organizations o where o.id = org;

  if ancien is null then
    raise exception 'Organisation introuvable.' using errcode = 'no_data_found';
  end if;

  if ancien = nouveau then
    raise exception 'Cette organisation est déjà « % ».', nouveau using errcode = 'check_violation';
  end if;

  update public.organizations
  set status = nouveau, updated_at = now()
  where id = org
  returning * into ligne;

  perform app.log_event('organization', org, 'set_status', ancien::text, nouveau::text,
    jsonb_build_object('org_id', org));

  return ligne;
end;
$$;

revoke execute on function public.set_org_status(uuid, public.org_status) from public, anon;
grant execute on function public.set_org_status(uuid, public.org_status) to authenticated;

-- -----------------------------------------------------------------------------
-- Les interrupteurs, obéis
--
-- C'est la partie qui fait la différence entre un réglage et un décor.
-- -----------------------------------------------------------------------------

/**
 * ⚠️ **Des déclencheurs, et non un contrôle en tête de chaque fonction.**
 *
 * La tentation était de recopier `open_conversation` et `send_message` en leur
 * ajoutant une ligne. Deux raisons de ne pas le faire, et la seconde est
 * décisive :
 *
 * - Recopier un corps de 0037 pour y ajouter une ligne le fige en double. La
 *   prochaine retouche du masquage n'atteindrait que l'une des deux copies.
 * - **Il existe un troisième chemin d'écriture** que cette approche aurait
 *   laissé ouvert : `open_conversation_for_request`, qui ouvre un fil depuis
 *   une demande de devis. Un interrupteur qui ferme deux portes sur trois ne
 *   ferme rien.
 *
 * Un déclencheur sur la table couvre tous les chemins, présents et à venir —
 * y compris une correction manuelle faite en console.
 *
 * La **lecture** reste intacte : couper la messagerie n'efface pas ce qui a été
 * dit, et n'empêche pas un client de relire ce qu'on lui a promis.
 */
create or replace function app.guard_messaging()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.feature_enabled('messagerie') then
    raise exception 'La messagerie est momentanément indisponible.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_feature_guard on conversations;
create trigger conversations_feature_guard
  before insert on conversations
  for each row execute function app.guard_messaging();

drop trigger if exists messages_feature_guard on messages;
create trigger messages_feature_guard
  before insert on messages
  for each row execute function app.guard_messaging();

/**
 * Les inscriptions partenaires, fermées à la source.
 *
 * Le compte naît dans `app.handle_new_user`, un déclencheur sur `auth.users` :
 * l'organisation partenaire y est créée dans la foulée. Plutôt que de recopier
 * cette fonction de cent lignes pour y glisser un contrôle, on garde l'entrée
 * de la table.
 *
 * ⚠️ **Aucune exemption, pas même pour l'administration**, et c'est un choix
 * réfléchi plutôt qu'un oubli. La tentation était d'ajouter `and not
 * app.is_admin()` pour continuer d'enrôler des partenaires à la main pendant
 * une fermeture. Deux raisons de ne pas le faire :
 *
 * - **Cette exemption serait morte.** La migration 0021 a retiré `insert` sur
 *   `organizations` à `authenticated` ; un administrateur en fait partie. Il
 *   n'a donc aucun chemin d'insertion à exempter. Un garde-fou qui protège un
 *   passage inexistant donne l'illusion d'une souplesse qu'on n'a pas.
 * - **Depuis une console, `app.is_admin()` est faux** : il n'y a pas de
 *   revendication JWT. L'exemption n'aurait donc pas davantage servi là où on
 *   l'aurait cherchée.
 *
 * Enrôler un partenaire pendant une fermeture se fait donc en rallumant
 * l'interrupteur le temps de l'opération. C'est un geste de plus, tracé dans
 * `audit_logs`, et c'est mieux qu'une porte dérobée.
 *
 * Le refus poli, lui, vit dans l'écran : ce déclencheur est le filet qui
 * attrape une charge utile fabriquée, pas le message que lit l'utilisateur.
 */
create or replace function app.guard_partner_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'partner' and not app.feature_enabled('inscriptions_partenaires') then
    raise exception 'Les inscriptions partenaires sont momentanément fermées.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_signup_guard on organizations;
create trigger organizations_signup_guard
  before insert on organizations
  for each row execute function app.guard_partner_signup();
