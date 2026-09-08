-- =============================================================================
-- 0004 — Référentiel : arborescence des catégories et équipements.
--
-- Ce n'est pas un jeu de test : ces lignes font partie du produit et doivent
-- exister en production. Les données de démonstration, elles, vivent dans
-- supabase/seed.sql et ne sont jamais poussées.
--
-- Écrit pour être rejouable : `on conflict (slug) do nothing` partout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Familles
-- -----------------------------------------------------------------------------

insert into categories (kind, slug, name, description, icon, sort_order) values
  ('venue',   'lieux',        'Lieux',         'Salles, villas, hôtels, espaces verts et lieux atypiques.', 'building-2', 10),
  ('service', 'restauration', 'Restauration',  'Traiteurs, pâtisserie, bar et restauration mobile.',        'utensils',   20),
  ('service', 'ambiance',     'Ambiance',      'Décoration, fleurs, son et lumière.',                       'sparkles',   30),
  ('service', 'animation',    'Animation',     'Maîtres de cérémonie, animateurs et activités.',            'mic',        40),
  ('service', 'logistique',   'Logistique',    'Matériel, transport, sécurité et personnel.',               'truck',      50),
  ('service', 'image',        'Image',         'Photographie, vidéo et souvenirs.',                         'camera',     60),
  ('service', 'conseil',      'Conseil',       'Organisation, coordination et communication.',              'clipboard-list', 70),
  ('service', 'beaute',       'Beauté',        'Coiffure, maquillage et tenues.',                           'scissors',   80)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Catégories
--
-- Le parent est retrouvé par slug : l'ordre d'insertion n'a pas d'importance et
-- la migration reste lisible.
-- -----------------------------------------------------------------------------

insert into categories (kind, slug, name, parent_id, sort_order)
select c.kind::category_kind, c.slug, c.name, parent.id, c.sort_order
from (values
  -- Lieux
  ('venue', 'salle-de-reception',   'Salle de réception',        'lieux', 10),
  ('venue', 'villa',                'Villa',                     'lieux', 20),
  ('venue', 'hotel-seminaire',      'Hôtel & salle de séminaire','lieux', 30),
  ('venue', 'espace-vert',          'Espace vert & jardin',      'lieux', 40),
  ('venue', 'rooftop',              'Rooftop',                   'lieux', 50),
  ('venue', 'plage',                'Plage & bord de mer',       'lieux', 60),
  ('venue', 'salle-de-conference',  'Salle de conférence',       'lieux', 70),
  ('venue', 'restaurant-privatisable','Restaurant privatisable', 'lieux', 80),
  ('venue', 'espace-coworking',     'Espace de coworking',       'lieux', 90),
  ('venue', 'chapiteau',            'Chapiteau',                 'lieux', 100),

  -- Restauration
  ('service', 'traiteur',           'Traiteur',                  'restauration', 10),
  ('service', 'patisserie',         'Pâtisserie & wedding cake', 'restauration', 20),
  ('service', 'bar-cocktails',      'Bar & cocktails',           'restauration', 30),
  ('service', 'food-truck',         'Food truck',                'restauration', 40),

  -- Ambiance
  ('service', 'decoration',         'Décoration & scénographie', 'ambiance', 10),
  ('service', 'fleuriste',          'Fleuriste',                 'ambiance', 20),
  ('service', 'dj-sonorisation',    'DJ & sonorisation',         'ambiance', 30),
  ('service', 'orchestre',          'Orchestre & groupe live',   'ambiance', 40),
  ('service', 'eclairage',          'Éclairage & effets spéciaux','ambiance', 50),

  -- Animation
  ('service', 'maitre-de-ceremonie','Maître de cérémonie',       'animation', 10),
  ('service', 'animateur',          'Animateur',                 'animation', 20),
  ('service', 'troupe-traditionnelle','Griot & troupe traditionnelle', 'animation', 30),
  ('service', 'team-building',      'Team building & activités', 'animation', 40),

  -- Logistique
  ('service', 'location-equipement','Location d''équipement',    'logistique', 10),
  ('service', 'mobilier-tentes',    'Mobilier & tentes',         'logistique', 20),
  ('service', 'transport',          'Transport & navettes',      'logistique', 30),
  ('service', 'securite',           'Sécurité',                  'logistique', 40),
  ('service', 'personnel-service',  'Hôtes(ses) & personnel de service', 'logistique', 50),
  ('service', 'nettoyage',          'Nettoyage',                 'logistique', 60),

  -- Image
  ('service', 'photographe',        'Photographe',               'image', 10),
  ('service', 'videaste',           'Vidéaste',                  'image', 20),
  ('service', 'drone',              'Captation par drone',       'image', 30),
  ('service', 'photobooth',         'Photobooth',                'image', 40),

  -- Conseil
  ('service', 'wedding-planner',    'Wedding planner',           'conseil', 10),
  ('service', 'agence-evenementielle','Agence événementielle',   'conseil', 20),
  ('service', 'imprimerie',         'Imprimerie & goodies',      'conseil', 30),

  -- Beauté
  ('service', 'coiffure',           'Coiffure',                  'beaute', 10),
  ('service', 'maquillage',         'Maquillage',                'beaute', 20),
  ('service', 'location-tenues',    'Habillement & location de tenues', 'beaute', 30)
) as c (kind, slug, name, parent_slug, sort_order)
join categories parent on parent.slug = c.parent_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Équipements
--
-- `applies_to` restreint le filtre proposé : demander « groupe électrogène » a
-- du sens sur un lieu, pas sur un maquilleur. NULL = pertinent partout.
-- -----------------------------------------------------------------------------

insert into amenities (slug, name, icon, applies_to, sort_order) values
  ('wifi',                'Wi-Fi',                      'wifi',        'venue', 10),
  ('climatisation',       'Climatisation',              'snowflake',   'venue', 20),
  ('groupe-electrogene',  'Groupe électrogène',         'zap',         'venue', 30),
  ('parking',             'Parking',                    'car',         'venue', 40),
  ('cuisine-equipee',     'Cuisine équipée',            'chef-hat',    'venue', 50),
  ('sonorisation',        'Sonorisation sur place',     'volume-2',     'venue', 60),
  ('videoprojecteur',     'Vidéoprojecteur',            'projector',   'venue', 70),
  ('scene',               'Scène',                      'theater',     'venue', 80),
  ('piscine',             'Piscine',                    'waves',       'venue', 90),
  ('jardin',              'Jardin',                     'trees',       'venue', 100),
  ('terrasse',            'Terrasse',                   'sun',         'venue', 110),
  ('vestiaire',           'Vestiaire',                  'shirt',       'venue', 120),
  ('acces-pmr',           'Accès pour personnes à mobilité réduite', 'accessibility', 'venue', 130),
  ('tables-chaises',      'Tables et chaises fournies', 'armchair',    'venue', 140),
  ('gardiennage',         'Gardiennage',                'shield',      'venue', 150),
  ('deplacement-inclus',  'Déplacement inclus',         'map-pin',     'service', 200),
  ('materiel-fourni',     'Matériel fourni',            'package',     'service', 210),
  ('devis-gratuit',       'Devis gratuit',              'file-text',   'service', 220),
  ('equipe-dediee',       'Équipe dédiée',              'users',       'service', 230)
on conflict (slug) do nothing;
