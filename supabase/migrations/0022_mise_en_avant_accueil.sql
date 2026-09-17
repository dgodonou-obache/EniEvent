-- =============================================================================
-- 0022 — De quoi composer un accueil honnête.
--
-- L'accueil déversait 39 catégories en pastilles identiques, dont **27 sans
-- aucune annonce**. Un visiteur qui cliquait « Photographe » tombait sur une
-- page vide : la promesse du catalogue n'était pas tenue, et rien à l'écran ne
-- distinguait un métier fourni d'un métier désert.
--
-- Deux vues pour y remédier, toutes deux en `security_invoker` — sans quoi
-- elles s'exécuteraient avec les droits de leur propriétaire et exposeraient
-- des annonces que la RLS cache (leçon de la migration 0008).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Combien d'annonces vivantes par catégorie
--
-- Compté en base plutôt que dans l'application : ramener toutes les annonces
-- pour les dénombrer côté serveur Next fonctionnerait à quinze annonces et
-- s'effondrerait à mille.
-- -----------------------------------------------------------------------------
create or replace view category_live_counts
with (security_invoker = true)
as
  select
    c.slug as category_slug,
    c.name as category_name,
    p.slug as family_slug,
    count(l.id) as listings
  from public.categories c
  left join public.categories p on p.id = c.parent_id
  left join public.listings l
    on l.category_id = c.id
   and l.status = 'approved'
   and l.is_paused = false
  where c.is_active and c.parent_id is not null
  group by c.slug, c.name, p.slug, c.sort_order, p.sort_order
  order by p.sort_order, c.sort_order;

comment on view category_live_counts is
  'Nombre d''annonces publiées par catégorie. Sert à ne mettre en avant que les métiers réellement pourvus.';

-- -----------------------------------------------------------------------------
-- Réservable tout de suite
--
-- **Le seul signal de mise en avant qui ne s'invente pas.** Il n'existe ni
-- avis, ni note, ni réservation : classer par popularité reviendrait à
-- fabriquer des étoiles, ce qui tromperait le client autant que le partenaire.
--
-- Ici, la promesse est vérifiable ligne à ligne : le partenaire accepte la
-- réservation immédiate **et** a ouvert des dates à venir. Si les dates se
-- ferment, l'annonce quitte la sélection d'elle-même.
-- -----------------------------------------------------------------------------
create or replace view listings_bookable_now
with (security_invoker = true)
as
  select
    s.*,
    d.dates_ouvertes,
    d.prochaine_date
  from public.listing_search s
  join lateral (
    select count(*) as dates_ouvertes, min(a.date) as prochaine_date
    from public.availabilities a
    where a.listing_id = s.id
      and a.status = 'open'
      and a.date >= current_date
  ) d on d.dates_ouvertes > 0
  where s.booking_mode in ('instant', 'both');

comment on view listings_bookable_now is
  'Annonces réservables sans devis, avec au moins une date ouverte à venir. Mise en avant fondée sur un fait, non sur une popularité inventée.';

grant select on category_live_counts, listings_bookable_now to anon, authenticated;
