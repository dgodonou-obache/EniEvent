-- =============================================================================
-- 0013 — Un appel d'offres peut attendre l'aval d'un valideur.
--
-- Isolé dans sa propre migration : `alter type ... add value` ajoute la valeur,
-- mais PostgreSQL interdit de **l'utiliser** dans la même transaction. Les
-- politiques et les contraintes de la migration suivante s'y réfèrent, elles ne
-- pourraient pas être créées ici.
--
-- Placée avant `open` : une demande d'entreprise passe par cet état avant
-- d'être publiée, jamais après.
-- =============================================================================

alter type quote_request_status add value if not exists 'pending_approval' before 'open';
