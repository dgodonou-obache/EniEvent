-- =============================================================================
-- 0008 — Vue de recherche.
--
-- Filtrer par capacité, par équipement et par catégorie à travers cinq tables
-- imbriquées est laborieux depuis PostgREST, et impossible à combiner en « OU ».
-- Cette vue aplatit ce dont la recherche a besoin, et rien d'autre.
--
-- `security_invoker = true` est ESSENTIEL : sans lui, une vue s'exécute avec
-- les droits de son propriétaire et contournerait silencieusement la RLS des
-- tables sous-jacentes. Tout le catalogue, brouillons compris, deviendrait
-- lisible par n'importe qui. Disponible depuis PostgreSQL 15 ; le projet est
-- en 17.
-- =============================================================================

create view listing_search
with (security_invoker = true)
as
select
  l.id,
  l.slug,
  l.title,
  l.description,
  l.city,
  l.district,
  l.kind,
  l.cover_url,
  l.currency,
  l.booking_mode,
  l.price_from,
  l.min_price,
  l.rating_avg,
  l.rating_count,
  l.latitude,
  l.longitude,
  l.status,
  l.is_paused,
  l.published_at,
  l.org_id,

  c.slug   as category_slug,
  c.name   as category_name,
  parent.slug as family_slug,
  parent.name as family_name,

  o.slug        as org_slug,
  coalesce(o.brand_name, o.legal_name) as org_name,
  o.status      as org_status,
  pp.is_verified as org_verified,

  -- Capacité comparable entre un lieu et un service : le nombre d'invités que
  -- l'annonce peut accueillir ou servir. C'est ce que l'utilisateur saisit,
  -- sans avoir à savoir laquelle des deux tables le porte.
  coalesce(
    v.capacity_standing,
    v.capacity_seated,
    v.capacity_cocktail,
    s.max_guests
  ) as max_capacity,

  v.capacity_seated,
  v.capacity_standing,
  v.surface_m2,
  s.min_guests,

  -- Agrégé pour permettre un filtre « possède tous ces équipements » en une
  -- seule condition (`@>`), au lieu d'une jointure par équipement demandé.
  coalesce(
    (
      select array_agg(a.slug order by a.slug)
      from listing_amenities la
      join amenities a on a.id = la.amenity_id
      where la.listing_id = l.id
    ),
    '{}'::text[]
  ) as amenity_slugs,

  -- Colonne de recherche plein texte, exploitée par pg_trgm.
  concat_ws(' ', l.title, l.city, l.district, c.name, o.brand_name, o.legal_name) as search_text

from listings l
join categories c on c.id = l.category_id
left join categories parent on parent.id = c.parent_id
join organizations o on o.id = l.org_id
left join partner_profiles pp on pp.org_id = o.id
left join venue_details v on v.listing_id = l.id
left join service_details s on s.listing_id = l.id;

comment on view listing_search is
  'Vue aplatie du catalogue pour la recherche. security_invoker : la RLS des '
  'tables sous-jacentes s''applique à l''appelant, un brouillon reste invisible.';

-- `concat_ws` est STABLE et ne peut pas figurer dans une expression d'index :
-- on concatène avec `||`, immuable, en neutralisant les NULL.
create index listings_search_text_idx on listings using gin (
  (coalesce(title, '') || ' ' || coalesce(city, '') || ' ' || coalesce(district, ''))
  gin_trgm_ops
);

grant select on listing_search to anon, authenticated;
