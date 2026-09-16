-- =============================================================================
-- Données de démonstration — DÉVELOPPEMENT UNIQUEMENT.
--
-- Ne jamais appliquer en production : ce sont de faux prestataires. Le
-- référentiel réel (catégories, équipements, villes) vit dans les migrations.
--
-- Rejouable : tout est protégé par `on conflict do nothing`. Les montants sont
-- en francs CFA, entiers, conformément à src/lib/money.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Partenaires
-- -----------------------------------------------------------------------------

insert into organizations (type, legal_name, brand_name, slug, status, country, city, phone) values
  ('partner', 'Espaces Cotonou SARL',    'Espaces Cotonou',   'espaces-cotonou',   'active', 'BJ', 'Cotonou',       '+2290197000001'),
  ('partner', 'Saveurs du Bénin',        'Saveurs du Bénin',  'saveurs-du-benin',  'active', 'BJ', 'Cotonou',       '+2290197000002'),
  ('partner', 'Décor Ahossi',            'Décor Ahossi',      'decor-ahossi',      'active', 'BJ', 'Cotonou',       '+2290197000003'),
  ('partner', 'Résidences Ouidah SARL',  'Résidences Ouidah', 'residences-ouidah', 'active', 'BJ', 'Ouidah',        '+2290196000004'),
  ('partner', 'Sono Calavi Pro',         'Sono Calavi',       'sono-calavi',       'active', 'BJ', 'Abomey-Calavi', '+2290195000005'),
  ('partner', 'Cérémonies du Golfe',     'Cérémonies du Golfe','ceremonies-golfe', 'active', 'BJ', 'Porto-Novo',    '+2290194000006')
on conflict (slug) do nothing;

insert into partner_profiles (org_id, bio, service_cities, years_experience, is_verified, verified_at)
select o.id, p.bio, p.cities, p.years, true, now()
from (values
  ('espaces-cotonou',   'Salles et espaces de réception à Cotonou et sur le littoral béninois.',                 array['Cotonou', 'Abomey-Calavi', 'Sèmè-Podji'], 12),
  ('saveurs-du-benin',  'Cuisine béninoise et internationale, du cocktail au banquet de 500 couverts.',          array['Cotonou', 'Porto-Novo', 'Abomey-Calavi'],  9),
  ('decor-ahossi',      'Scénographie et décoration florale pour mariages et événements d''entreprise.',         array['Cotonou', 'Porto-Novo'],                   6),
  ('residences-ouidah', 'Villas et jardins de réception à Ouidah et Grand-Popo, face à l''océan.',               array['Ouidah', 'Grand-Popo'],                   14),
  ('sono-calavi',       'Sonorisation, éclairage et régie technique dans tout le sud du Bénin.',                 array['Abomey-Calavi', 'Cotonou', 'Porto-Novo'], 10),
  ('ceremonies-golfe',  'Maîtres de cérémonie bilingues français-fon pour mariages, dots et cérémonies.',        array['Porto-Novo', 'Cotonou', 'Ouidah'],         8)
) as p (slug, bio, cities, years)
join organizations o on o.slug = p.slug
on conflict (org_id) do nothing;

-- -----------------------------------------------------------------------------
-- Annonces
--
-- Statut `approved` d'emblée : le garde-fou de modération ne s'applique qu'en
-- présence d'un utilisateur authentifié, pas aux écritures de service.
-- Les slugs sont choisis, pas dérivés : ce sont des URL publiques.
-- Les coordonnées alimentent la vue carte de la recherche.
-- -----------------------------------------------------------------------------

insert into listings (
  org_id, category_id, kind, slug, title, description, city, district,
  latitude, longitude, currency, booking_mode, min_price, status,
  cancellation_policy_id, payment_terms
)
select
  o.id, c.id, c.kind, l.slug, l.title, l.description, l.city, l.district,
  l.lat, l.lng, 'XOF', l.mode::booking_mode, l.min_price, 'approved',
  pol.id, l.payment_terms
from (values
  ('espaces-cotonou', 'salle-de-reception', 'salle-etoile-haie-vive', 'Salle Étoile — Haie Vive',
   'Salle de réception climatisée au cœur de la Haie Vive, idéale pour les mariages et les soirées d''entreprise. Groupe électrogène et parking gardé sur place.',
   'Cotonou', 'Haie Vive', 6.358000::numeric, 2.400000::numeric, 'both', 150000::bigint, 'moderee',
   'Un acompte de 50 % bloque la date. Le solde est à régler au plus tard 3 jours avant l''événement.'),

  ('espaces-cotonou', 'salle-de-conference', 'auditorium-cadjehoun', 'Auditorium Cadjèhoun',
   'Auditorium de 180 places en configuration théâtre, sonorisation et vidéoprojection incluses. Proche de l''aéroport.',
   'Cotonou', 'Cadjèhoun', 6.353000::numeric, 2.383000::numeric, 'instant', 250000::bigint, 'flexible',
   'Acompte de 30 % à la réservation.'),

  ('espaces-cotonou', 'espace-vert', 'jardin-fidjrosse', 'Jardin de Fidjrossè',
   'Grand jardin arboré de 2 000 m² à deux pas de la plage, jusqu''à 500 invités. Chapiteau montable sur demande.',
   'Cotonou', 'Fidjrossè', 6.352000::numeric, 2.353000::numeric, 'both', 100000::bigint, 'flexible',
   'Acompte de 30 % à la réservation, solde le jour de l''événement.'),

  ('residences-ouidah', 'villa', 'villa-atlantique-ouidah', 'Villa Atlantique',
   'Villa les pieds dans l''eau sur la route des pêches, piscine et jardin privatif. Jusqu''à 100 personnes en cocktail.',
   'Ouidah', 'Route des pêches', 6.336000::numeric, 2.070000::numeric, 'instant', 300000::bigint, 'non-remboursable',
   'Paiement intégral à la réservation.'),

  ('residences-ouidah', 'plage', 'paillote-grand-popo', 'Paillote de Grand-Popo',
   'Espace de réception face à l''océan, sous paillote traditionnelle. Cadre privilégié pour les mariages en petit comité.',
   'Grand-Popo', 'Bord de mer', 6.283300::numeric, 1.823600::numeric, 'both', 180000::bigint, 'moderee',
   'Un acompte de 50 % bloque la date.'),

  ('espaces-cotonou', 'salle-de-reception', 'espace-tokpa-porto-novo', 'Espace Tokpa',
   'Salle de réception de 300 places à Porto-Novo, avec cuisine professionnelle et espace traiteur dédié.',
   'Porto-Novo', 'Centre', 6.496900::numeric, 2.628900::numeric, 'both', 200000::bigint, 'moderee',
   'Un acompte de 50 % bloque la date, le solde est dû 7 jours avant.'),

  ('saveurs-du-benin', 'traiteur', 'buffet-beninois-200-couverts', 'Buffet béninois — 200 couverts',
   'Buffet complet : amiwo, poulet braisé, atassi, poisson grillé, akassa, desserts. Service et vaisselle inclus.',
   'Cotonou', null, null::numeric, null::numeric, 'quote', null::bigint, 'moderee',
   'Acompte de 40 % à la commande, solde à la livraison.'),

  ('saveurs-du-benin', 'traiteur', 'cocktail-dinatoire-premium', 'Cocktail dînatoire premium',
   'Pièces cocktail chaudes et froides, 12 pièces par personne, service à l''assiette possible.',
   'Cotonou', null, null::numeric, null::numeric, 'both', null::bigint, 'flexible',
   'Acompte de 40 % à la commande.'),

  ('decor-ahossi', 'decoration', 'decoration-mariage-complete', 'Décoration de mariage complète',
   'Scénographie sur mesure : arche florale, chemin de table, habillage de salle, éclairage d''ambiance.',
   'Cotonou', null, null::numeric, null::numeric, 'quote', null::bigint, 'ferme',
   'Acompte de 50 % à la signature du devis.'),

  ('decor-ahossi', 'fleuriste', 'compositions-florales-evenementielles', 'Compositions florales événementielles',
   'Bouquets, centres de table et arches en fleurs fraîches, livrés et installés le jour J.',
   'Cotonou', null, null::numeric, null::numeric, 'both', null::bigint, 'moderee',
   'Paiement intégral 48 h avant la livraison.'),

  ('sono-calavi', 'location-equipement', 'pack-sono-lumiere-300', 'Pack sonorisation & lumière 300 personnes',
   'Système son 4 000 W, table de mixage, 8 projecteurs LED, machine à fumée. Technicien inclus.',
   'Abomey-Calavi', null, null::numeric, null::numeric, 'instant', 120000::bigint, 'moderee',
   'Acompte de 50 % à la réservation, caution restituée après retour du matériel.'),

  ('sono-calavi', 'dj-sonorisation', 'dj-evenementiel-soiree', 'DJ événementiel — soirée complète',
   'DJ expérimenté : afrobeat, coupé-décalé, zouk, variété internationale. Six heures de prestation.',
   'Abomey-Calavi', null, null::numeric, null::numeric, 'both', 80000::bigint, 'flexible',
   'Acompte de 30 % à la réservation.'),

  ('ceremonies-golfe', 'maitre-de-ceremonie', 'maitre-ceremonie-bilingue', 'Maître de cérémonie bilingue',
   'Animation et conduite de cérémonie en français et en fon. Coordination du déroulé avec les prestataires.',
   'Porto-Novo', null, null::numeric, null::numeric, 'both', 75000::bigint, 'moderee',
   'Acompte de 30 % à la réservation, solde le jour de l''événement.'),

  ('ceremonies-golfe', 'troupe-traditionnelle', 'troupe-zangbeto', 'Troupe traditionnelle Zangbéto',
   'Troupe de danse et percussions traditionnelles du sud Bénin. Prestation d''une heure, 8 artistes.',
   'Porto-Novo', null, null::numeric, null::numeric, 'quote', null::bigint, 'ferme',
   'Acompte de 50 % à la réservation.')
) as l (org_slug, category_slug, slug, title, description, city, district, lat, lng, mode, min_price, policy_slug, payment_terms)
join organizations o on o.slug = l.org_slug
join categories c on c.slug = l.category_slug
join cancellation_policies pol on pol.slug = l.policy_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Caractéristiques des lieux
-- -----------------------------------------------------------------------------

insert into venue_details (
  listing_id, capacity_seated, capacity_standing, capacity_cocktail, surface_m2,
  parking_spots, has_outdoor_space, has_kitchen, accessibility_pmr, noise_curfew_hour
)
select l.id, v.seated, v.standing, v.cocktail, v.surface, v.parking,
       v.outdoor, v.kitchen, v.pmr, v.curfew
from (values
  ('salle-etoile-haie-vive',   200, 250, 220,  400, 40, false, true,  true,  2),
  ('auditorium-cadjehoun',     180, 180, 120,  260, 60, false, false, true,  22),
  ('jardin-fidjrosse',         350, 500, 450, 2000, 80, true,  false, true,  23),
  ('villa-atlantique-ouidah',   60, 100,  80,  300, 15, true,  true,  false, null),
  ('paillote-grand-popo',      120, 180, 150,  500, 25, true,  false, false, 23),
  ('espace-tokpa-porto-novo',  300, 380, 340,  550, 45, false, true,  true,  2)
) as v (slug, seated, standing, cocktail, surface, parking, outdoor, kitchen, pmr, curfew)
join listings l on l.slug = v.slug
on conflict (listing_id) do nothing;

insert into service_details (listing_id, min_guests, max_guests, travel_radius_km, setup_time_min)
select l.id, s.min_g, s.max_g, s.radius, s.setup
from (values
  ('buffet-beninois-200-couverts',          50,  500,  60, 180),
  ('cocktail-dinatoire-premium',            30,  300,  60, 120),
  ('decoration-mariage-complete',           null, null, 80, 300),
  ('compositions-florales-evenementielles', null, null, 50,  90),
  ('pack-sono-lumiere-300',                 null, 300, 120, 150),
  ('dj-evenementiel-soiree',                null, null, 120,  60),
  ('maitre-ceremonie-bilingue',             null, null, 100,  30),
  ('troupe-zangbeto',                       null, null,  80,  45)
) as s (slug, min_g, max_g, radius, setup)
join listings l on l.slug = s.slug
on conflict (listing_id) do nothing;

-- -----------------------------------------------------------------------------
-- Tarifs
-- -----------------------------------------------------------------------------

insert into pricing_rules (listing_id, unit, base_price, weekend_multiplier)
select l.id, p.unit::price_unit, p.price, p.weekend
from (values
  ('salle-etoile-haie-vive',                'day',      150000::bigint, 1.30),
  ('salle-etoile-haie-vive',                'half_day',  90000::bigint, 1.20),
  ('auditorium-cadjehoun',                  'day',      250000::bigint, 1.00),
  ('jardin-fidjrosse',                      'day',      100000::bigint, 1.25),
  ('villa-atlantique-ouidah',               'day',      300000::bigint, 1.50),
  ('paillote-grand-popo',                   'day',      180000::bigint, 1.40),
  ('espace-tokpa-porto-novo',               'day',      200000::bigint, 1.30),
  ('buffet-beninois-200-couverts',          'person',    12000::bigint, 1.00),
  ('cocktail-dinatoire-premium',            'person',    18000::bigint, 1.00),
  ('decoration-mariage-complete',           'forfait',  450000::bigint, 1.00),
  -- Habillage de salle facturé au mètre carré : usage courant au Bénin, et de
  -- quoi vérifier que l'unité remonte bien jusqu'à la carte de résultat.
  ('decoration-mariage-complete',           'square_meter', 3500::bigint, 1.00),
  ('compositions-florales-evenementielles', 'item',      25000::bigint, 1.00),
  ('pack-sono-lumiere-300',                 'day',      120000::bigint, 1.20),
  ('dj-evenementiel-soiree',                'forfait',   80000::bigint, 1.25),
  ('maitre-ceremonie-bilingue',             'forfait',   75000::bigint, 1.20),
  ('troupe-zangbeto',                       'forfait',  150000::bigint, 1.00)
) as p (slug, unit, price, weekend)
join listings l on l.slug = p.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Équipements des lieux
-- -----------------------------------------------------------------------------

insert into listing_amenities (listing_id, amenity_id)
select l.id, a.id
from (values
  ('salle-etoile-haie-vive',  array['wifi', 'climatisation', 'groupe-electrogene', 'parking', 'cuisine-equipee', 'sonorisation', 'acces-pmr', 'tables-chaises']),
  ('auditorium-cadjehoun',    array['wifi', 'climatisation', 'videoprojecteur', 'sonorisation', 'scene', 'acces-pmr', 'parking']),
  ('jardin-fidjrosse',        array['jardin', 'parking', 'groupe-electrogene', 'acces-pmr', 'gardiennage', 'terrasse']),
  ('villa-atlantique-ouidah', array['wifi', 'climatisation', 'piscine', 'jardin', 'terrasse', 'parking', 'cuisine-equipee']),
  ('paillote-grand-popo',     array['jardin', 'terrasse', 'parking', 'groupe-electrogene', 'gardiennage']),
  ('espace-tokpa-porto-novo', array['wifi', 'climatisation', 'parking', 'cuisine-equipee', 'scene', 'vestiaire', 'acces-pmr', 'tables-chaises'])
) as m (slug, amenity_slugs)
join listings l on l.slug = m.slug
join amenities a on a.slug = any (m.amenity_slugs)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Disponibilités : six mois glissants, ouverts sauf le lundi (jour de repos).
--
-- Le tarif suit la règle du jour : majoration week-end appliquée au prix de
-- base. Le déclencheur de prix plancher valide chaque ligne au passage.
-- -----------------------------------------------------------------------------

insert into availabilities (listing_id, date, slot, status, price, inventory)
select
  l.id,
  d::date,
  'journee',
  case when extract(isodow from d) = 1 then 'closed' else 'open' end::availability_status,
  case
    when extract(isodow from d) in (6, 7)
      then round(p.base_price * p.weekend_multiplier)::bigint
    else p.base_price
  end,
  1
from listings l
join pricing_rules p on p.listing_id = l.id and p.unit = 'day'
cross join generate_series(current_date, current_date + interval '6 months', interval '1 day') as d
on conflict (listing_id, date, slot) do nothing;
