-- =============================================================================
-- 0015 — Une seule adresse de facturation.
--
-- La migration 0014 a ajouté `billing_email` et `billing_address` à
-- `company_settings`, alors que `organizations` porte déjà `billing_email` et
-- `address` depuis la migration 0002. Deux emplacements pour le même fait
-- finissent toujours par diverger : l'un est mis à jour, l'autre reste, et
-- personne ne sait lequel fait foi le jour où une facture part.
--
-- Les colonnes de `company_settings` n'ont jamais été écrites — elles n'ont
-- vécu que le temps d'un typecheck. `company_settings` garde ce qui lui est
-- propre : le seuil de validation et le circuit d'aval.
-- =============================================================================

alter table company_settings
  drop column if exists billing_email,
  drop column if exists billing_address;
