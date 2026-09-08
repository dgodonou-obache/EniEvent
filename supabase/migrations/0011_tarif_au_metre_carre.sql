-- =============================================================================
-- 0011 — Tarification au mètre carré.
--
-- Unité courante en Afrique de l'Ouest, et au Bénin en particulier : chapiteaux
-- et bâches, moquette et tapis de sol, plancher de scène, stands et cloisons,
-- habillage de salle. Le prestataire annonce un prix au m² et multiplie par la
-- surface à couvrir — imposer un forfait l'obligerait à refaire un devis pour
-- chaque surface, ou à annoncer un prix faux.
--
-- `add value` est irréversible : PostgreSQL ne sait pas retirer une valeur d'une
-- énumération. C'est assumé — l'unité est structurante, pas expérimentale.
-- Placée avant `forfait`, qui reste la valeur fourre-tout de fin de liste.
-- =============================================================================

alter type price_unit add value if not exists 'square_meter' before 'forfait';
