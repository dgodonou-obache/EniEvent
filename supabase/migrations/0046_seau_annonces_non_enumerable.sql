-- =============================================================================
-- 0046 — Le seau des photos cesse d'être énumérable
--
-- Audit du 8 octobre 2026. `annonces_public_read` (migration 0016) accordait
-- `select` sur `storage.objects` à tout le monde, y compris à un visiteur sans
-- session. Mesuré :
--
--     anon.storage.from("annonces").list("")  ->  2 dossiers d'organisations
--
-- De là, on descend : un dossier par organisation, puis un par annonce, puis
-- tous les fichiers. L'inventaire complet des dépôts de chaque partenaire —
-- y compris les photos d'annonces encore en brouillon ou refusées à la
-- modération, qui n'ont jamais été montrées à personne.
--
-- ⚠️ **Un seau public ne rend pas son catalogue public pour autant.** Les deux
-- choses sont distinctes et c'est ce qui rend le correctif possible :
--
--   - afficher une vignette passe par `/storage/v1/object/public/…`, qui
--     **ignore la RLS** puisque le seau est déclaré public (§3 du guide) ;
--   - énumérer passe par l'API `list`, qui **applique** la politique `select`.
--
-- Fermer la seconde ne touche donc pas à la première. Vérifié avant d'écrire
-- cette migration : le dépôt n'appelle ni `.list()` ni `getPublicUrl()` sur ce
-- seau — les adresses des photos sont stockées en base (`listings.cover_url`,
-- `listing_photos.storage_path`) et rendues telles quelles.
-- =============================================================================

drop policy if exists annonces_public_read on storage.objects;

-- Le nom change avec le sens : il n'y a plus de lecture publique par l'API.
drop policy if exists annonces_read on storage.objects;
create policy annonces_read on storage.objects
  for select using (
    bucket_id = 'annonces'
    and (
      -- Le cloisonnement tient au chemin, comme à l'écriture (0016) : le
      -- premier segment est l'identifiant de l'organisation.
      app.is_org_member(((storage.foldername(name))[1])::uuid)
      or app.is_admin()
    )
  );

comment on policy annonces_read on storage.objects is
  'Énumération et lecture par l''API réservées au propriétaire du dossier et à '
  'l''administration (migration 0046). L''affichage public des vignettes passe '
  'par l''URL publique du seau, qui n''applique pas la RLS.';
