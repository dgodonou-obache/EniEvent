-- =============================================================================
-- 0055 — Le dossier KYC existe enfin ailleurs que dans la base.
--
-- Signalé le 5 novembre 2026 par l'exploitant : le back-office annonce
-- « Dossiers KYC à vérifier » mais ne montre aucun document, et renvoie vers un
-- écran de **commission**. Mesuré avant d'écrire quoi que ce soit :
--
--     pièces déposées ........ 0        partenaires ......... 10
--     fichiers dans le seau .. 0        dont « vérifiés » ....  6
--     annonces publiées ...... 15
--
-- Trois constats, et le troisième est le plus grave.
--
-- **1. La tuile ne compte pas ce qu'elle dit.** « Dossiers KYC à vérifier »
-- comptait `partner_profiles.is_verified = false` — un drapeau booléen sans
-- aucun lien avec un document. Les quatre « dossiers » étaient quatre
-- inscriptions réelles qui n'ont jamais rien déposé.
--
-- **2. Tout existait sauf l'écran.** `kyc_documents` porte `status`,
-- `reviewed_by`, `reviewed_at`, `rejection_reason` depuis la migration 0002 ; la
-- RLS ouvre la lecture et la décision à l'administration ; le seau privé lui est
-- lisible (0041) ; le partenaire dépose ses pièces sur `/pro/documents`. Il
-- manquait uniquement l'écran qui les regarde — et donc, un partenaire qui
-- déposait lisait « En cours de vérification » **indéfiniment**.
--
-- **3. Le badge « vérifié » ne pouvait pas être gagné.** `is_verified` a été
-- retirée du `grant update` par la migration 0021 : aucune fonction du dépôt ne
-- pouvait l'écrire. Ses six valeurs `true` viennent toutes du *seed*. Le badge
-- n'était donc pas « mal attribué » : il n'existait aucun chemin pour
-- l'attribuer.
--
-- Cette migration pose les trois pièces manquantes :
--
-- - `app.kyc_validated(org)` — un dossier est complet quand **chaque pièce
--   obligatoire** a une version approuvée ;
-- - `public.review_kyc_document` — la porte d'écriture de l'administration, sur
--   le moule de `set_commission_rate` : `is_verified` n'étant dans aucun
--   `grant`, seule une fonction `security definer` peut la poser ;
-- - `app.guard_listing_publication` — décision d'exploitation du 5 novembre
--   2026 : **un partenaire dépose son annonce quand il veut, elle ne devient
--   visible qu'après validation de son dossier par ÉniEvent.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Les pièces obligatoires
--
-- ⚠️ **`insurance` n'en fait pas partie, et ce n'est pas un oubli.** L'écran du
-- partenaire la présente comme conditionnelle — « responsabilité civile
-- professionnelle, si votre activité l'exige ». L'exiger rendrait tout dossier
-- incomplet à jamais, puisque la plupart des prestataires n'en déposeront
-- aucune : le badge ne serait jamais atteint et plus aucune annonce ne pourrait
-- être publiée. Une pièce facultative ne se glisse pas dans une condition
-- d'accès.
--
-- La liste double `KYC_TYPES` (`src/lib/validation/partner.ts`), où les quatre
-- mêmes valeurs portent leurs libellés. `tests/rls-kyc.test.ts` lit cette
-- fonction pour vérifier que les deux disent la même chose.
-- -----------------------------------------------------------------------------
create or replace function app.kyc_required_types()
returns public.kyc_document_type[]
language sql
immutable
as $$
  select array['id_card', 'rccm', 'ifu', 'bank_details']::public.kyc_document_type[];
$$;

comment on function app.kyc_required_types() is
  'Pièces sans lesquelles un dossier est incomplet. « insurance » est conditionnelle et n''y figure pas.';

-- -----------------------------------------------------------------------------
-- Un dossier est-il validé ?
--
-- ⚠️ **Au moins une version approuvée par pièce**, et non « aucune refusée » :
-- un partenaire qui redépose un RCCM après un refus a deux lignes, l'ancienne
-- refusée et la nouvelle approuvée. Compter les refus bloquerait un dossier
-- pourtant complet, sans que rien ne l'explique.
-- -----------------------------------------------------------------------------
create or replace function app.kyc_validated(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org is not null and not exists (
    select 1
    from unnest(app.kyc_required_types()) as attendue(type)
    where not exists (
      select 1 from public.kyc_documents k
      where k.org_id = org
        and k.type = attendue.type
        and k.status = 'approved'
    )
  );
$$;

comment on function app.kyc_validated(uuid) is
  'Vrai quand chaque pièce obligatoire a une version approuvée. Commande le badge « vérifié » et la publication des annonces.';

revoke execute on function app.kyc_validated(uuid) from public, anon;
grant execute on function app.kyc_validated(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Ce qui manque à un dossier, en clair
--
-- Pour l'écran d'administration et pour le message de refus : « il manque le
-- RCCM » vaut mieux que « dossier incomplet ».
-- -----------------------------------------------------------------------------
create or replace function app.kyc_missing_types(org uuid)
returns public.kyc_document_type[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(attendue.type order by attendue.type), '{}')
  from unnest(app.kyc_required_types()) as attendue(type)
  where not exists (
    select 1 from public.kyc_documents k
    where k.org_id = org and k.type = attendue.type and k.status = 'approved'
  );
$$;

revoke execute on function app.kyc_missing_types(uuid) from public, anon;
grant execute on function app.kyc_missing_types(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- La décision de l'administration
--
-- ⚠️ **Seule porte d'écriture de `is_verified`.** La migration 0021 a retiré
-- cette colonne du `grant update` de `authenticated`, et un administrateur est
-- lui aussi `authenticated` : un `update` direct ne lèverait rien et toucherait
-- zéro ligne — le cas silencieux du §3. Même moule que `set_commission_rate`,
-- `set_account_type` et `set_org_status`.
--
-- ⚠️ **Le badge se recalcule, il ne se décrète pas.** `is_verified` est posée
-- depuis `app.kyc_validated`, jamais depuis la décision en cours : approuver la
-- dernière pièce d'un dossier l'allume, refuser une pièce déjà approuvée
-- l'éteint. Un badge qu'on pourrait poser à la main redeviendrait ce qu'il
-- était — une affirmation que rien ne soutient.
-- -----------------------------------------------------------------------------
create or replace function public.review_kyc_document(
  piece uuid,
  decision public.kyc_status,
  motif text default null
)
returns public.kyc_documents
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.kyc_documents;
  avant public.kyc_status;
  valide boolean;
begin
  if not app.is_admin() then
    raise exception 'La validation d''un dossier relève de l''administration.'
      using errcode = 'insufficient_privilege';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Une décision est « approved » ou « rejected ».'
      using errcode = 'check_violation';
  end if;

  -- La contrainte `rejected_has_reason` le refuserait aussi, mais son message
  -- ne dit pas quoi faire. Un refus sans motif est de toute façon inutile :
  -- le partenaire doit savoir quoi redéposer.
  if decision = 'rejected' and coalesce(btrim(motif), '') = '' then
    raise exception 'Un refus s''accompagne d''un motif : le partenaire doit savoir quoi refaire.'
      using errcode = 'check_violation';
  end if;

  select status into avant from public.kyc_documents where id = piece;
  if avant is null then
    raise exception 'Pièce introuvable.' using errcode = 'no_data_found';
  end if;

  update public.kyc_documents
  set status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when decision = 'rejected' then btrim(motif) else null end
  where id = piece
  returning * into ligne;

  valide := app.kyc_validated(ligne.org_id);

  update public.partner_profiles
  set is_verified = valide,
      -- L'horodatage garde la **première** validation : il raconte depuis quand
      -- la structure est identifiée, pas la date du dernier document touché.
      verified_at = case
        when valide then coalesce(verified_at, now())
        else null
      end
  where org_id = ligne.org_id;

  perform app.log_event('kyc_document', piece, 'review', avant::text, decision::text,
    jsonb_build_object('org_id', ligne.org_id, 'type', ligne.type, 'dossier_valide', valide));

  return ligne;
end;
$$;

revoke execute on function public.review_kyc_document(uuid, public.kyc_status, text)
  from public, anon;
grant execute on function public.review_kyc_document(uuid, public.kyc_status, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Une annonce ne devient visible qu'après validation du dossier
--
-- Décision d'exploitation du 5 novembre 2026, dans ces termes : « le partenaire
-- peut faire sa demande pour publier une annonce, mais l'annonce ne sera
-- visible qu'après la validation par ÉniEvent ». Le dépôt reste donc libre —
-- rien ne change pour `draft` ni `pending` —, c'est le passage en `approved`
-- qui exige le dossier.
--
-- ⚠️ **Dans un déclencheur de table, jamais dans la Server Action de
-- modération** (§2). L'écran est une porte d'entrée, pas un rempart : la file
-- de modération écrit `listings.status` par un `update` direct, et un second
-- chemin d'écriture — une reprise manuelle, un script — contournerait un
-- contrôle posé dans l'action.
--
-- ⚠️ **La clé de service est exemptée**, comme pour `app.guard_listing_moderation`
-- juste au-dessus : le *seed* et `demo:reset` écrivent des annonces déjà
-- validées, et un contrôle qui casse le jeu de démonstration finit par être
-- retiré en entier.
--
-- ⚠️ **Les annonces déjà publiées ne bougent pas.** Le déclencheur ne regarde
-- que la **transition** vers `approved` : les 15 annonces en ligne le restent.
-- Dépublier rétroactivement aurait vidé la vitrine d'un seul coup, sur une
-- décision qui ne visait que les publications à venir.
--
-- ⚠️ **La condition porte sur `is_verified`, et non sur les pièces elles-mêmes.**
-- Les deux reviennent au même pour un partenaire réel : `is_verified` n'est
-- écrite que par `review_kyc_document` ci-dessus, qui la recalcule depuis
-- `app.kyc_validated`. Mais les six structures de démonstration portent ce
-- drapeau depuis le *seed*, sans pièce — décision d'exploitation du 5 novembre
-- 2026, qui les laisse telles quelles. Exiger les pièces aurait obligé à en
-- inventer de fausses **en production** pour que le monde de démonstration
-- continue de fonctionner, et à les faire défiler dans l'écran de contrôle au
-- milieu des vrais dossiers. Un drapeau qu'on ne peut allumer que par la bonne
-- porte vaut mieux qu'un faux document.
-- -----------------------------------------------------------------------------
create or replace function app.guard_listing_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manquantes public.kyc_document_type[];
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status <> 'approved' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;

  if coalesce(
    (select pp.is_verified from public.partner_profiles pp where pp.org_id = new.org_id),
    false
  ) then
    return new;
  end if;

  manquantes := app.kyc_missing_types(new.org_id);

  raise exception
    'Dossier du prestataire incomplet : % reste à valider. Une annonce ne se publie qu''après validation du dossier.',
    array_to_string(manquantes, ', ')
    using errcode = 'check_violation';
end;
$$;

comment on function app.guard_listing_publication() is
  'Refuse la mise en ligne d''une annonce tant que le dossier du prestataire n''est pas validé. Exempte la clé de service.';

drop trigger if exists listings_guard_publication on listings;

create trigger listings_guard_publication
  before insert or update of status on listings
  for each row execute function app.guard_listing_publication();
