-- =============================================================================
-- 0021 — La RLS dit quelles lignes, jamais quelles colonnes.
--
-- Trois élévations de privilèges étaient possibles, toutes vérifiées avec de
-- vrais comptes contre la base réelle :
--
--   profiles.account_type          particulier → admin      (back-office entier)
--   partner_profiles.is_verified   false → true             (badge « vérifié »)
--   organizations.status           pending → active         (contourne la validation)
--
-- `organization_members.role` avait l'air atteignable — mêmes droits de colonne
-- — mais sa politique RLS exige déjà un rôle dirigeant : un `staff` ne peut pas
-- se promouvoir. Vérifié, et durci ici par précaution seulement.
--
-- Toutes par le même chemin : `update ... where id = auth.uid()` passe la RLS,
-- qui ne contrôle que **la ligne**. Les droits de colonne, eux, étaient
-- accordés en bloc — y compris sur les colonnes qui définissent les privilèges.
--
-- `app.handle_new_user` refusait pourtant déjà un `account_type` « admin »
-- demandé à l'inscription (migration 0006). Ce garde-fou ne servait à rien : il
-- suffisait de s'inscrire normalement, puis de se promouvoir.
--
-- Deux remparts plutôt qu'un :
--   1. **Droits par colonne** — un utilisateur ne peut écrire que ce qui le
--      regarde. C'est le mécanisme principal, et il est total.
--   2. **Déclencheurs de garde** — ils refusent le changement même si un
--      `grant` trop large revenait un jour. Une protection qui dépend de la
--      mémoire d'un futur intervenant n'en est pas une.
--
-- Aucune régression possible côté application : hors `/entreprise/parametres`,
-- qui met à jour la fiche de son entreprise, **rien dans `src/` n'écrit dans
-- ces cinq tables** — vérifié avant d'écrire cette migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — l'utilisateur modifie son identité, jamais son rôle
-- -----------------------------------------------------------------------------
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url, locale, country, city)
  on public.profiles to authenticated;
-- La ligne naît dans `app.handle_new_user`, jamais par le client.

-- -----------------------------------------------------------------------------
-- organizations — les coordonnées, pas le statut
--
-- Exactement les huit colonnes qu'écrit `/entreprise/parametres`. `status`,
-- `type`, `slug` et `account_manager_id` relèvent de l'administration.
-- -----------------------------------------------------------------------------
revoke insert, update on public.organizations from anon, authenticated;
grant update (legal_name, brand_name, logo_url, city, address, phone, billing_email, rccm, ifu)
  on public.organizations to authenticated;

-- -----------------------------------------------------------------------------
-- partner_profiles — la vitrine, pas la confiance
--
-- `is_verified`, `verified_at`, `commission_rate_override` et les notes
-- (`rating_avg`, `rating_count`, `acceptance_rate`) sont des jugements portés
-- *sur* le partenaire : il ne les écrit pas lui-même.
-- -----------------------------------------------------------------------------
revoke insert, update on public.partner_profiles from anon, authenticated;
grant update (bio, service_cities, travel_radius_km, years_experience)
  on public.partner_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- organization_members — aucune écriture directe
--
-- Rôle, statut et appartenance définissent qui peut quoi. La gestion d'équipe
-- (lot 3) passera par une fonction qui vérifiera le rôle de l'appelant ; d'ici
-- là, aucune écriture par un utilisateur.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on public.organization_members from anon, authenticated;

-- -----------------------------------------------------------------------------
-- kyc_documents — rien à restreindre ici
--
-- La politique `kyc_documents_review` réserve déjà l'`update` aux
-- administrateurs (`using (app.is_admin())`) : un partenaire ne peut pas
-- toucher son propre dossier, quelle que soit la colonne.
--
-- Y ajouter une restriction par colonne serait une erreur : un administrateur
-- est lui aussi un utilisateur `authenticated`, et un `grant` ne sait pas
-- distinguer les deux. Restreindre la colonne `status` aurait bloqué la
-- validation par l'administration — le seul usage légitime de cette table.
-- C'est la limite du mécanisme : les droits de colonne valent par rôle
-- Postgres, la RLS par ligne. Ici seule la RLS peut trancher.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Second rempart : déclencheurs de garde
--
-- `auth.uid() is null` désigne la clé de service, les migrations et les
-- déclencheurs internes : eux doivent pouvoir écrire, c'est par eux que passent
-- l'administration et l'amorçage des comptes de démonstration.
-- -----------------------------------------------------------------------------
create or replace function app.guard_privilege_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  appelant uuid := auth.uid();
begin
  if appelant is null or app.is_admin() then
    return new;
  end if;

  -- Conditions **imbriquées**, jamais combinées par `and` : plpgsql prépare
  -- chaque condition comme une seule expression SQL, et `new.account_type`
  -- serait résolu même sur une table qui n'a pas cette colonne — le
  -- court-circuit n'opère pas, l'erreur est « record "new" has no field ».
  if tg_table_name = 'profiles' then
    if new.account_type is distinct from old.account_type then
      raise exception 'Le type de compte ne se change pas soi-même.' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'partner_profiles' then
    if new.is_verified is distinct from old.is_verified
       or new.commission_rate_override is distinct from old.commission_rate_override then
      raise exception 'La vérification et la commission relèvent de l''administration.' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'organizations' then
    if new.status is distinct from old.status then
      raise exception 'Le statut d''une organisation relève de l''administration.' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'organization_members' then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Le rôle et le statut d''un membre ne se changent pas soi-même.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function app.guard_privilege_columns();

create trigger partner_profiles_guard_privileges
  before update on partner_profiles
  for each row execute function app.guard_privilege_columns();

create trigger organizations_guard_privileges
  before update on organizations
  for each row execute function app.guard_privilege_columns();

create trigger organization_members_guard_privileges
  before update on organization_members
  for each row execute function app.guard_privilege_columns();

-- -----------------------------------------------------------------------------
-- Fuite de données : les destinataires d'une demande
--
-- `app.request_recipients` rend les numéros et les identifiants des partenaires
-- mis en concurrence. Le schéma `app` n'est pas exposé par PostgREST, donc la
-- fonction n'était pas atteignable — mais rien ne garantissait qu'elle le reste.
-- Elle ne sert qu'au déclencheur, qui s'exécute avec les droits de son
-- propriétaire : personne d'autre n'a besoin de l'appeler.
-- -----------------------------------------------------------------------------
revoke execute on function app.request_recipients(uuid, int) from anon, authenticated;
