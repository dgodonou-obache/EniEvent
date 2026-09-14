-- =============================================================================
-- 0016 — Photos des annonces.
--
-- La table `listing_media` existe depuis la migration 0003, mais rien n'a
-- jamais été branché derrière : ni seau de stockage, ni règle d'écriture. Une
-- annonce sans photo ne se réserve pas — c'est la première chose que regarde un
-- client, avant le prix.
--
-- **Tout le cloisonnement repose sur le chemin.** Un objet est rangé sous
-- `{org_id}/{listing_id}/{fichier}`, et les politiques ci-dessous n'autorisent
-- l'écriture que sous l'identifiant d'une organisation dont l'utilisateur est
-- membre. Sans cela, n'importe quel partenaire pourrait remplacer les photos
-- d'un concurrent, ou déposer n'importe quoi sous son nom.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('annonces', 'annonces', true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Lecture publique
--
-- Le seau est public : une photo d'annonce est vue par des visiteurs non
-- connectés, et passer chaque vignette par une URL signée coûterait un
-- aller-retour par image, sur des connexions qui n'en ont pas les moyens.
-- Rien de confidentiel n'y est déposé.
-- -----------------------------------------------------------------------------

drop policy if exists annonces_public_read on storage.objects;
create policy annonces_public_read on storage.objects
  for select using (bucket_id = 'annonces');

-- -----------------------------------------------------------------------------
-- Écriture réservée au propriétaire du dossier
--
-- Comparaison en texte plutôt qu'un transtypage en uuid : un chemin forgé dont
-- le premier dossier n'est pas un identifiant ferait échouer la conversion et
-- remonterait une erreur Postgres au lieu d'un simple refus.
-- -----------------------------------------------------------------------------

drop policy if exists annonces_write on storage.objects;
create policy annonces_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'annonces'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists annonces_update on storage.objects;
create policy annonces_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'annonces'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists annonces_delete on storage.objects;
create policy annonces_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'annonces'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
    )
  );

-- -----------------------------------------------------------------------------
-- Ordre d'affichage
--
-- `unique (listing_id, position)` interdit deux photos au même rang. On ne
-- renumérote jamais : la position est l'ordre d'arrivée, et la photo de
-- couverture est désignée à part, dans `listings.cover_url`. Renuméroter
-- demanderait une contrainte différable pour un gain nul.
-- -----------------------------------------------------------------------------

comment on column listing_media.storage_path is
  'Chemin dans le seau « annonces » : {org_id}/{listing_id}/{fichier}. '
  'L''URL publique est reconstruite à la lecture — stocker une URL complète la '
  'figerait sur le domaine du projet du jour.';

comment on column listings.cover_url is
  'URL publique de la photo de couverture, désignée par le partenaire. '
  'Maintenue par les Server Actions à chaque changement de photo.';
