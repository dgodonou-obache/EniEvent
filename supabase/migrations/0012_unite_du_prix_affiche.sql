-- =============================================================================
-- 0012 — L'unité du « à partir de », jusqu'au catalogue.
--
-- `listings.price_from` est le plus petit tarif de l'annonce, toutes unités
-- confondues. La carte de résultat n'affichait que le montant : « à partir de
-- 12 000 FCFA » pour un buffet facturé 12 000 F **par personne**. Le défaut
-- existait déjà ; l'arrivée du tarif au m² le rendait intenable — 3 500 F le m²
-- se serait lu « à partir de 3 500 FCFA », soit vingt fois moins que la
-- prestation réelle.
--
-- On dénormalise donc l'unité à côté du montant, par le même déclencheur : les
-- deux valeurs proviennent de la même ligne de `pricing_rules` et ne peuvent
-- pas se désynchroniser.
-- =============================================================================

alter table listings
  add column if not exists price_from_unit price_unit;

comment on column listings.price_from_unit is
  'Unité du tarif retenu pour price_from. Dénormalisée avec lui, par le même '
  'déclencheur : afficher un montant sans son unité induit le client en erreur.';

create or replace function app.refresh_price_from()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.listings l
  set price_from = (
        select min(p.base_price) from public.pricing_rules p where p.listing_id = target
      ),
      -- Le tarif le moins cher, et son unité. `unit` départage deux règles au
      -- même prix, pour que le résultat soit déterministe.
      price_from_unit = (
        select p.unit
        from public.pricing_rules p
        where p.listing_id = target
        order by p.base_price asc, p.unit asc
        limit 1
      )
  where l.id = target;

  return null;
end;
$$;

-- Rattrapage des annonces déjà en base.
update listings l
set price_from_unit = (
  select p.unit
  from pricing_rules p
  where p.listing_id = l.id
  order by p.base_price asc, p.unit asc
  limit 1
)
where l.price_from_unit is null;

-- `create or replace view` impose de conserver les colonnes existantes dans le
-- même ordre : la nouvelle ne peut qu'être ajoutée en fin de liste, loin de
-- `price_from` qu'elle accompagne pourtant.
create or replace view listing_search
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

  coalesce(
    (
      select array_agg(a.slug order by a.slug)
      from listing_amenities la
      join amenities a on a.id = la.amenity_id
      where la.listing_id = l.id
    ),
    '{}'::text[]
  ) as amenity_slugs,

  concat_ws(' ', l.title, l.city, l.district, c.name, o.brand_name, o.legal_name) as search_text,

  l.price_from_unit

from listings l
join categories c on c.id = l.category_id
left join categories parent on parent.id = c.parent_id
join organizations o on o.id = l.org_id
left join partner_profiles pp on pp.org_id = o.id
left join venue_details v on v.listing_id = l.id
left join service_details s on s.listing_id = l.id;
