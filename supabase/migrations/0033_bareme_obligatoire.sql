-- =============================================================================
-- 0033 — Une annonce porte toujours ses conditions d'annulation.
--
-- Défaut constaté en production, et non en théorie : sur quinze annonces
-- publiées, **une n'avait aucun barème**. L'éditeur du partenaire propose
-- « Aucune politique choisie », et la fiche annonce se contente alors de ne
-- rien afficher.
--
-- C'était sans conséquence tant que personne ne lisait ces barèmes. Depuis la
-- migration 0032, ce n'est plus le cas : `app.policy_for_listing` retombe sur
-- le barème modéré de la plateforme. Autrement dit, le client se voyait
-- appliquer à l'annulation des conditions **qu'on ne lui avait jamais
-- montrées**. C'est exactement ce que `CLAUDE.md` §5 interdit.
--
-- Deux manières de refermer le trou :
--
-- 1. afficher le repli sur la fiche — mais un partenaire découvrirait des
--    conditions qu'il n'a pas choisies ;
-- 2. **exiger un barème**, et remplir le vide une fois pour toutes.
--
-- La seconde, parce qu'elle rend le cas nul impossible plutôt que de le
-- traiter partout. Un déclencheur pose le repli à l'écriture — ainsi le
-- barème appliqué est celui qui est **inscrit**, donc celui qui s'affiche —
-- et la colonne devient `not null`, ce qui est la seule garantie qui tienne
-- quelle que soit la voie d'écriture.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Repli à l'écriture
--
-- Avant l'insertion **et** avant la mise à jour : sans le second cas, un
-- partenaire rouvrirait le trou au premier enregistrement de sa fiche.
-- -----------------------------------------------------------------------------
create or replace function app.default_cancellation_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cancellation_policy_id is null then
    select p.id into new.cancellation_policy_id
    from public.cancellation_policies p
    where p.slug = 'moderee';
  end if;

  return new;
end;
$$;

create trigger listings_default_cancellation_policy
  before insert or update of cancellation_policy_id on listings
  for each row execute function app.default_cancellation_policy();

-- Les annonces déjà publiées sans barème en héritent.
update listings
set cancellation_policy_id = (select id from cancellation_policies where slug = 'moderee')
where cancellation_policy_id is null;

alter table listings alter column cancellation_policy_id set not null;

comment on column listings.cancellation_policy_id is
  'Conditions d''annulation affichées au client et appliquées au remboursement. '
  'Obligatoires : une annonce sans conditions verrait s''appliquer un barème '
  'que personne ne lui a montré.';
