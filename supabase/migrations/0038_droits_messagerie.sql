-- =============================================================================
-- 0038 — Retirer les droits que Supabase accorde tout seul.
--
-- **Constaté en production, pas en test.** La migration 0037 disait « aucun
-- `grant` sur `messages` : lecture par fonction uniquement ». C'était vrai dans
-- le Postgres jetable des tests, et faux sur le vrai projet :
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'messages';
--   → anon: INSERT, SELECT, UPDATE, DELETE, TRUNCATE…
--   → authenticated: INSERT, SELECT, UPDATE, DELETE, TRUNCATE…
--
-- Supabase pose un `alter default privileges` qui accorde **tout** à `anon` et
-- `authenticated` sur chaque table neuve de `public`. PGlite ne le reproduit
-- pas : un test « la table n'est pas lisible » y passe sans rien prouver.
--
-- ⚠️ **Il n'y avait pas de faille pour autant.** La RLS refuse ce qu'aucune
-- politique n'autorise : `messages` n'ayant de politique que pour
-- l'administration, un `select` d'un tiers rendait zéro ligne, et un `insert`
-- était refusé faute de politique. Mais une protection qui tient par un seul
-- fil n'est pas une protection : si quelqu'un ajoute demain une politique de
-- lecture à `messages` pour une bonne raison, le masquage tombe sans que rien
-- ne le signale.
--
-- D'où ce retrait explicite. Le corps brut d'un message ne sort que par
-- `read_conversation`, et c'est désormais vrai des deux côtés.
-- =============================================================================

-- Aucune écriture directe sur les trois tables : tout passe par
-- `open_conversation`, `send_message` et `read_conversation`.
revoke insert, update, delete, truncate on conversations from anon, authenticated;
revoke insert, update, delete, truncate on messages from anon, authenticated;
revoke insert, update, delete, truncate on conversation_reads from anon, authenticated;

-- Et surtout : pas de lecture du corps brut, qui contournerait le masquage.
revoke select on messages from anon, authenticated;

-- `conversations` et `conversation_reads` restent lisibles — leurs politiques
-- cloisonnent déjà, et l'interface a besoin de la liste.
revoke select on conversations from anon;
revoke select on conversation_reads from anon;

comment on table messages is
  'Corps brut des messages. Non lisible directement : le masquage des '
  'coordonnées vit dans read_conversation, et un select le contournerait.';
