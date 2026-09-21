-- =============================================================================
-- 0036 — Refermer l'annuaire.
--
-- Constaté par un appel réel, sans aucune session :
--
--   select brand_name, phone from organizations where type = 'partner'
--   → [{"brand_name":"Saveurs du Bénin","phone":"+2290197000002"}, …]
--
-- `grant select on organizations … to anon` (migration 0002) rend le **numéro
-- de téléphone de tous les partenaires lisible par n'importe qui**, sans même
-- créer de compte. Et `src/lib/listings.ts` chargeait ce numéro dans la charge
-- utile RSC de chaque fiche publique — invisible à l'écran, présent dans la
-- source.
--
-- C'est le contournement le plus direct de la plateforme : on relève les
-- numéros, on appelle, on réserve en direct, et la commission ne s'applique à
-- rien. Toute protection posée ailleurs — le masquage des coordonnées dans la
-- messagerie, par exemple — serait décorative tant que cette porte reste
-- ouverte. D'où cette migration **avant** la messagerie, et non avec.
--
-- ⚠️ **La RLS ne sait pas filtrer une colonne.** `organizations_select` doit
-- rester permissive : c'est elle qui permet d'afficher « proposé par » sur une
-- annonce. Seul un droit de colonne peut retirer le téléphone sans retirer le
-- nom — règle §3 du guide.
--
-- ⚠️ **Un administrateur est lui aussi `authenticated`.** Un droit de colonne
-- ne sait pas l'en distinguer : lui rendre le téléphone par un `grant` le
-- rendrait à tout le monde. Les lectures légitimes — l'organisation qui relit
-- ses propres coordonnées, l'administration qui prépare un versement — passent
-- donc par une fonction `SECURITY DEFINER`. Même limite, et même réponse, que
-- pour `kyc_documents` (migration 0021).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ce qui reste public
--
-- Énumération **positive** : ajouter une colonne à `organizations` demain ne la
-- rendra pas publique par inadvertance. C'est l'inverse d'un `revoke` ciblé,
-- qui laisserait passer tout ce qu'on n'a pas pensé à nommer.
-- -----------------------------------------------------------------------------
revoke select on organizations from anon, authenticated;

grant select (
  id, type, legal_name, brand_name, slug, logo_url,
  country, city, address, status, created_at, updated_at
) on organizations to anon, authenticated;

comment on column organizations.phone is
  'Hors de l''annuaire public depuis la migration 0036 : le relever permettait '
  'de réserver en direct. Lecture par public.org_contact().';

comment on column organizations.billing_email is
  'Hors de l''annuaire public (0036). Lecture par public.org_contact(), et par '
  'app.org_email() pour les notifications.';

-- -----------------------------------------------------------------------------
-- Les lectures légitimes
--
-- Un membre relit les coordonnées de sa propre organisation ; l'administration
-- lit celles de tout le monde. Personne d'autre.
-- -----------------------------------------------------------------------------
create or replace function public.org_contact(org uuid)
returns table (
  phone text,
  billing_email text,
  rccm text,
  ifu text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.phone, o.billing_email::text, o.rccm, o.ifu
  from public.organizations o
  where o.id = org
    and (app.is_org_member(org) or app.is_admin());
$$;

revoke execute on function public.org_contact(uuid) from public, anon;
grant execute on function public.org_contact(uuid) to authenticated;

comment on function public.org_contact(uuid) is
  'Coordonnées d''une organisation, réservées à ses membres et à l''administration.';
