-- =============================================================================
-- 0001 — Fondations : extensions, schéma technique, utilitaires communs.
-- =============================================================================

create extension if not exists pg_trgm;   -- recherche floue (villes, annonces)
create extension if not exists citext;    -- e-mails insensibles à la casse
create extension if not exists btree_gist; -- contraintes d'exclusion sur les dates

-- Schéma technique : helpers de sécurité et déclencheurs. Volontairement hors
-- de `public`, qui est exposé par l'API REST — rien ici ne doit être appelable
-- depuis le client.
create schema if not exists app;
revoke all on schema app from public;

-- -----------------------------------------------------------------------------
-- Horodatage
-- -----------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at is
  'Déclencheur BEFORE UPDATE : maintient updated_at sans dépendre du client.';

-- -----------------------------------------------------------------------------
-- Identifiants lisibles (références de commande, numéros de facture)
-- -----------------------------------------------------------------------------

create sequence if not exists app.reference_seq;

create or replace function app.generate_reference(prefix text)
returns text
language sql
volatile
as $$
  select prefix || '-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('app.reference_seq')::text, 6, '0')
$$;

comment on function app.generate_reference is
  'Référence lisible et triable, ex. CMD-202609-000042. Un identifiant technique '
  'uuid reste la clé primaire ; cette référence est ce que lisent les humains.';
