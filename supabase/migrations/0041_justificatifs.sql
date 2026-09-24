-- =============================================================================
-- 0041 — Pièces justificatives : un seau privé
--
-- `kyc_documents` existe depuis la migration 0002 et porte déjà `file_path`,
-- mais **aucun seau n'a jamais été créé** : la table attendait un stockage qui
-- n'existait pas. Un partenaire ne pouvait donc déposer ni son RCCM, ni son
-- IFU, ni ses coordonnées de règlement — et l'administration validait des
-- comptes sur parole.
--
-- ⚠️ **Ce seau est privé, et c'est toute la différence avec `annonces`.**
-- Le seau des photos est public, délibérément : une vignette d'annonce est vue
-- par des visiteurs non connectés, et la signer coûterait un aller-retour par
-- image. Ici on dépose des **pièces d'identité et des coordonnées bancaires**.
-- Les déposer dans un seau public les rendrait lisibles par quiconque devine
-- ou intercepte une URL — une URL de stockage public n'est protégée par rien
-- d'autre que son obscurité, elle voyage dans les journaux, les caches et les
-- historiques.
--
-- La lecture se fait donc par **URL signée**, émise côté serveur, à durée
-- courte, et seulement à qui la politique ci-dessous autorise.
--
-- Cloisonnement par le chemin, comme pour `annonces` : `{org_id}/{fichier}`.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('justificatifs', 'justificatifs', false)
on conflict (id) do update set public = false;

-- -----------------------------------------------------------------------------
-- Lecture : l'organisation concernée, et l'administration
--
-- Aligné sur `kyc_documents_select` (migration 0002), qui réserve la ligne à
-- `owner` / `accountant` et à l'administration. Le fichier suit la même règle
-- que la fiche qui le décrit : les séparer laisserait lire le document à qui
-- n'a pas le droit d'en connaître l'existence.
-- -----------------------------------------------------------------------------

drop policy if exists justificatifs_read on storage.objects;
create policy justificatifs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'justificatifs'
    and (
      app.is_admin()
      or exists (
        select 1 from app.user_org_ids() as org
        where org::text = (storage.foldername(name))[1]
          and app.has_org_role(org, array['owner', 'accountant']::org_role[])
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Dépôt : le propriétaire ou le comptable de l'organisation
--
-- ⚠️ Pas `app.user_org_ids()` seul, contrairement aux photos. Un équipier
-- (`staff`) peut publier une annonce ; il n'a rien à faire avec la pièce
-- d'identité du dirigeant ni le RIB de la structure.
--
-- Comparaison en texte et non par transtypage en uuid : un chemin forgé dont
-- le premier dossier n'est pas un identifiant ferait échouer la conversion et
-- remonterait une erreur Postgres au lieu d'un simple refus.
-- -----------------------------------------------------------------------------

drop policy if exists justificatifs_write on storage.objects;
create policy justificatifs_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'justificatifs'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
        and app.has_org_role(org, array['owner', 'accountant']::org_role[])
    )
  );

-- -----------------------------------------------------------------------------
-- Remplacement et retrait
--
-- Remplacer une pièce est le cas courant : une carte expire, un RIB change.
-- On ne peut en revanche pas retirer une pièce **déjà validée** — elle est la
-- justification d'une décision de la plateforme, et l'effacer laisserait un
-- compte vérifié sans rien pour l'expliquer. La règle vit sur la table, plus
-- bas : le stockage ne connaît pas les statuts.
-- -----------------------------------------------------------------------------

drop policy if exists justificatifs_update on storage.objects;
create policy justificatifs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'justificatifs'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
        and app.has_org_role(org, array['owner', 'accountant']::org_role[])
    )
  );

drop policy if exists justificatifs_delete on storage.objects;
create policy justificatifs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'justificatifs'
    and exists (
      select 1 from app.user_org_ids() as org
      where org::text = (storage.foldername(name))[1]
        and app.has_org_role(org, array['owner', 'accountant']::org_role[])
    )
  );

-- -----------------------------------------------------------------------------
-- Une pièce validée ne se supprime plus
--
-- `kyc_documents` n'avait aucune politique `delete` : la table était donc en
-- lecture et écriture seules, et un partenaire ne pouvait pas retirer une
-- pièce déposée par erreur. On ouvre la suppression, mais **pas** sur les
-- pièces approuvées : celles-là justifient une décision prise par la
-- plateforme.
-- -----------------------------------------------------------------------------

drop policy if exists kyc_documents_delete on public.kyc_documents;
create policy kyc_documents_delete on public.kyc_documents
  for delete
  using (
    status <> 'approved'
    and app.has_org_role(org_id, array['owner', 'accountant']::org_role[])
  );

-- Les droits de table : la RLS ci-dessus ne s'applique qu'à ce qui est accordé.
grant delete on public.kyc_documents to authenticated;
