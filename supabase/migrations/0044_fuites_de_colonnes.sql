-- =============================================================================
-- 0044 — Refermer quatre tables ouvertes en lecture
--
-- Audit de sécurité du 8 octobre 2026. Quatre `grant select on <table>` posés
-- sans énumération de colonnes, dont deux portant une information qui n'aurait
-- jamais dû sortir. Mesuré sur la production, pas déduit du code.
--
-- ⚠️ **C'est la troisième fois.** `organizations.phone` (0036) puis
-- `organization_invitations.token` (0042) relevaient du même défaut, et le
-- guide le documente depuis. Un `grant select` de table est une **autorisation
-- permanente sur des colonnes qui n'existent pas encore** : il suffit qu'une
-- migration ultérieure ajoute un champ sensible pour qu'il devienne public le
-- jour même, sans que personne n'ait rien décidé. D'où l'énumération positive
-- partout ci-dessous.
--
-- Rappel qui explique pourquoi l'écran ne protège rien : PostgREST sert la
-- table, pas la page. `src/lib/quotes.ts` n'affichait pas le téléphone du
-- client, et il sortait quand même à qui le demandait directement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. partner_profiles — le taux de commission négocié était public
--
-- Lu sans aucune session, sur la production : un partenaire à 20 %. Les autres
-- suivaient le barème général, donc le dégât du jour était mince — mais la
-- commission **se négocie partenaire par partenaire** (§1 du guide), et c'est
-- précisément ce que cette colonne allait contenir. Un partenaire lisant ce que
-- paie son concurrent, c'est une crise commerciale, pas un incident technique.
--
-- Aucun code ne lisait cette colonne : l'administration passe par
-- `commission_settings()`, l'écriture par `set_commission_rate`. Le retrait est
-- donc sans effet sur le produit.
-- -----------------------------------------------------------------------------
revoke select on partner_profiles from anon, authenticated;

grant select (
  org_id, bio, service_cities, travel_radius_km, years_experience,
  response_time_avg_h, acceptance_rate, rating_avg, rating_count,
  is_verified, verified_at, created_at, updated_at
) on partner_profiles to anon, authenticated;

comment on column partner_profiles.commission_rate_override is
  'Hors de toute lecture directe depuis la migration 0044 : le taux négocié '
  'd''un partenaire est un secret d''affaires. Lecture par commission_settings(), '
  'écriture par set_commission_rate(), toutes deux réservées à l''administration.';

-- -----------------------------------------------------------------------------
-- 2. quote_requests — le téléphone du client partait chez tous les sollicités
--
-- `app.partner_can_see_request` ouvre la demande aux partenaires concernés,
-- ce qui est le principe même d'un appel d'offres. Mais la ligne portait
-- `contact_phone`, et une demande encore `open` le livrait donc à vingt
-- prestataires **avant le moindre engagement**.
--
-- ⚠️ Cela contredisait frontalement la messagerie : les coordonnées y sont
-- masquées jusqu'à l'encaissement pour que la vente reste sur la plateforme
-- (migration 0037). La commission étant l'unique revenu, cette colonne
-- distribuait gratuitement ce que tout le reste s'emploie à retenir.
--
-- Relevé en production, connecté comme partenaire :
--   DEM-202609-000039  statut=open  tel=+229019700XXXX  budget=4 500 000
-- -----------------------------------------------------------------------------
revoke select on quote_requests from anon, authenticated;

grant select (
  id, reference, requester_id, org_id, title, event_type,
  event_date, event_end_date, is_date_flexible, city, district, guests,
  budget_min, budget_max, currency, description, status, respond_by,
  published_at, created_at, updated_at, cost_center_id
) on quote_requests to anon, authenticated;

comment on column quote_requests.contact_phone is
  'Hors de toute lecture directe depuis la migration 0044 : le livrer aux '
  'partenaires sollicités contournait le masquage des coordonnées (0037) et '
  'permettait de traiter hors plateforme. Lecture par public.request_contact().';

-- -----------------------------------------------------------------------------
-- La lecture légitime du téléphone
--
-- Son auteur, ses collègues d'entreprise, l'administration. Personne d'autre —
-- et surtout pas un partenaire, fût-il retenu : qu'il obtienne les coordonnées
-- après encaissement relève de `read_conversation`, qui applique le seuil.
--
-- Même moule que `public.org_contact()` (0036). Cette fonction existe autant
-- pour servir une lecture que pour **fermer la porte de service** : sans elle,
-- le premier écran qui aura besoin du numéro le réclamera en remettant la
-- colonne dans le `grant`.
-- -----------------------------------------------------------------------------
create or replace function public.request_contact(demande uuid)
returns table (contact_phone text)
language sql
security definer
set search_path = ''
stable
as $$
  select r.contact_phone
  from public.quote_requests r
  where r.id = demande
    and (
      r.requester_id = auth.uid()
      or (r.org_id is not null and app.is_org_member(r.org_id))
      or app.is_admin()
    );
$$;

revoke all on function public.request_contact(uuid) from public, anon;
grant execute on function public.request_contact(uuid) to authenticated;

comment on function public.request_contact(uuid) is
  'Téléphone de contact d''une demande, pour son auteur, ses collègues et '
  'l''administration. Un partenaire sollicité n''y a pas accès (migration 0044).';

-- -----------------------------------------------------------------------------
-- 3. payment_schedules — les conditions de règlement de chaque organisation
--
-- `using (true)` et `grant select … to anon` : n'importe qui listait les
-- échéanciers de tous les partenaires — acomptes, pourcentages, délais. Ce sont
-- des conditions commerciales.
--
-- Rien de public ne les lit : l'interface de réservation recalcule l'échéancier
-- par `src/lib/fees.ts`, et la commande le fige par `app.build_instalments`,
-- qui est `security definer` et ignore donc ces droits. Seul
-- `/pro/parametres` lit la table, pour l'organisation de celui qui la consulte.
-- -----------------------------------------------------------------------------
revoke select on payment_schedules from anon;

drop policy if exists payment_schedules_select on payment_schedules;
create policy payment_schedules_select on payment_schedules
  for select using (app.is_org_member(org_id) or app.is_admin());

-- -----------------------------------------------------------------------------
-- 4. feature_flags — l'inventaire de ce qui est coupé
--
-- Divulgation mineure, mais gratuite à refermer : la liste dit à un visiteur
-- quelles fonctions sont éteintes, donc où insister. Seul `/admin` la lit.
--
-- ⚠️ `app.feature_enabled()` est `security definer` : les déclencheurs qui font
-- réellement obéir les interrupteurs (§2 du guide) ne dépendent pas de ce
-- droit et continuent de fonctionner.
-- -----------------------------------------------------------------------------
revoke select on feature_flags from anon;

drop policy if exists feature_flags_select on feature_flags;
create policy feature_flags_select on feature_flags
  for select using (app.is_admin());
