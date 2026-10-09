-- =============================================================================
-- 0047 — Un partenaire ne note pas ses propres annonces
--
-- Préalable au lot A, et faille à part entière.
--
--   0003_catalogue.sql:597   grant insert, update, delete on
--                              categories, …, listings, …  to authenticated;
--
-- Un `grant` de table, dans une liste de treize, posé quand `listings` n'avait
-- que des colonnes qu'un partenaire doit écrire. `listings_update`
-- (0003:548) l'ouvre à tout `owner` ou `manager` sur **la ligne entière**.
-- Résultat mesurable aujourd'hui, avant ce lot :
--
--     update listings set rating_avg = 5, rating_count = 128 where org_id = <la mienne>;
--
-- passe. Rien ne le refuse, rien ne le journalise.
--
-- ⚠️ **C'est le défaut que la migration 0044 décrit mot pour mot** : « un
-- `grant select` de table est une autorisation permanente sur des colonnes qui
-- n'existent pas encore ». Même phrase, même mécanisme, verbe `update`. Les
-- colonnes de notation ont été ajoutées à `listings` dans la même migration
-- 0003, sous le `grant`, et personne n'a eu à décider quoi que ce soit.
--
-- Cela ne se voyait pas parce qu'aucun écran n'affiche encore de note — mais
-- `ListingCard` et `ListingDetail` les rendent **déjà** dès qu'elles existent,
-- et le tri par défaut du catalogue est `rating_avg desc`
-- (`src/lib/listings.ts:184`). Le lot A allume l'affichage : il allumerait
-- aussi l'exploitation.
--
-- ⚠️ **`partner_profiles` a été protégé en 2021 par la migration 0021, pour ces
-- colonnes exactement**, et son commentaire le dit : « `rating_avg`,
-- `rating_count` sont des jugements portés *sur* le partenaire : il ne les
-- écrit pas lui-même ». `listings` porte les deux mêmes colonnes et a été
-- oubliée. Le même défaut, à deux tables de distance.
--
-- Cinq colonnes sont concernées, toutes **dérivées par déclencheur** et écrites
-- par rien dans `src/` — vérifié colonne par colonne avant d'écrire ceci :
--
--   rating_avg, rating_count     le jugement des clients (ce lot les remplit)
--   price_from, price_from_unit  recalculées depuis `pricing_rules` (0003:370,
--                                0012:33). `price_from = 1` fait remonter
--                                l'annonce en tête du tri par prix croissant
--                                **et affiche au client un prix qui n'existe
--                                dans aucun tarif**, jusqu'au prochain
--                                changement de tarification qui la recalcule.
--   published_at                 posée par `app.guard_listing_moderation`.
--                                C'est le départage du tri par défaut : la
--                                reculer, c'est se déclarer éternellement plus
--                                récent que les autres.
--
-- Ce qui **reste** écrivable, et pourquoi : `status` et `moderation_notes`.
-- Un administrateur est lui aussi `authenticated` (§3 du guide) et
-- `/admin/moderation` les écrit en direct : un droit de colonne ne sait pas les
-- distinguer, et les retirer casserait la validation des annonces. C'est
-- `app.guard_listing_moderation` qui tranche là, et c'est le bon mécanisme.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Énumération positive
--
-- ⚠️ **La seule forme qui marche.** `revoke update (rating_avg) on listings`
-- serait accepté sans erreur et sans effet : un `revoke` par colonne ne mord
-- que sur un `grant` par colonne (0036, 0042, 0044 — trois fois le même piège).
-- On retire donc le droit de table, puis on rend nommément ce qui doit l'être.
--
-- `delete` n'est pas touché : `listings_delete` le réserve déjà au rôle
-- `owner`, et une suppression ne porte pas sur des colonnes.
--
-- Corollaire assumé : plus aucun `insert into listings` ne peut nommer une
-- colonne hors de cette liste, tests compris. C'est le comportement voulu, pas
-- une régression.
-- -----------------------------------------------------------------------------
revoke insert, update on public.listings from anon, authenticated;

grant insert (
  org_id, org_type, category_id, kind,
  title, slug, description, highlights,
  city, district, address, latitude, longitude,
  cover_url, currency, booking_mode, min_notice_days, min_price,
  cancellation_policy_id, payment_terms,
  status, moderation_notes, is_paused,
  seo_title, seo_description
) on public.listings to authenticated;

-- `org_id` est absent de l'`update` : déplacer une annonce d'une organisation à
-- l'autre n'est pas une modification, c'est une cession. Rien n'en a besoin, et
-- laisser la colonne ouverte invite à s'y tromper.
grant update (
  org_type, category_id, kind,
  title, slug, description, highlights,
  city, district, address, latitude, longitude,
  cover_url, currency, booking_mode, min_notice_days, min_price,
  cancellation_policy_id, payment_terms,
  status, moderation_notes, is_paused,
  seo_title, seo_description
) on public.listings to authenticated;

comment on column public.listings.rating_avg is
  'Jugement des clients, recalculé par app.refresh_ratings(). Hors du grant '
  'update depuis la migration 0047 : un partenaire se donnait cinq étoiles en '
  'un appel, et le tri par défaut du catalogue l''en récompensait.';

comment on column public.listings.rating_count is
  'Nombre d''avis publiés et non masqués, recalculé par app.refresh_ratings(). '
  'Hors du grant update depuis la migration 0047.';

comment on column public.listings.price_from is
  'Recalculée depuis pricing_rules. Hors du grant update depuis la '
  'migration 0047 : écrite à la main, elle affichait au client un prix qui '
  'n''existe dans aucun tarif.';

comment on column public.listings.published_at is
  'Posée par app.guard_listing_moderation à la première validation. Hors du '
  'grant update depuis la migration 0047 : c''est le départage du tri par '
  'défaut du catalogue.';

-- -----------------------------------------------------------------------------
-- Le laissez-passer des recalculs
--
-- `app.refresh_ratings` (migration 0048) écrit `rating_avg` et `rating_count`
-- pour le compte du **client qui dépose son avis**. Elle est `security definer`
-- et ignore donc les droits de colonne ci-dessus — mais pas le déclencheur de
-- garde qui suit, car `auth.uid()` ne change pas en entrant dans une fonction
-- `security definer` : il vaut toujours l'identifiant du client.
--
-- D'où ce drapeau de session, posé et retiré par le recalcul. Il ne survit pas
-- à la transaction (`set local`), et aucun chemin utilisateur ne peut le poser :
-- `set_config` sur `app.*` demanderait d'exécuter du SQL arbitraire, ce que
-- PostgREST n'offre pas.
--
-- Pourquoi pas `app.is_admin()` à la place : le recalcul n'est pas une action
-- d'administration, c'est la conséquence immédiate d'un avis déposé par un
-- particulier.
-- -----------------------------------------------------------------------------
create or replace function app.recalcul_en_cours()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.recalcul', true), '') = 'oui';
$$;

comment on function app.recalcul_en_cours() is
  'Vrai pendant app.refresh_ratings(), seule écriture légitime de '
  'listings.rating_avg et listings.rating_count. Migration 0047.';

-- -----------------------------------------------------------------------------
-- Second rempart : un déclencheur de garde
--
-- Les droits de colonne sont le mécanisme principal et ils sont totaux. Mais
-- une protection qui dépend de la mémoire d'un futur intervenant n'en est pas
-- une : il suffit d'un `grant update on listings` reposé par commodité — c'est
-- exactement ce qui s'est produit en 0003 — pour que tout rouvre. Même moule
-- que `app.guard_privilege_columns` (0021), exemption de l'administration
-- comprise.
--
-- ⚠️ **Le déclencheur ne double que les deux colonnes de notation**, pas les
-- trois autres. Ce n'est pas un oubli : `price_from` et `published_at` ont
-- chacune un auteur légitime antérieur (`app.refresh_price_from` en 0003:370,
-- `app.guard_listing_moderation` en 0003:181), et les laisser passer
-- demanderait soit de rouvrir ces deux fonctions, soit de faire reposer la
-- garde sur l'ordre alphabétique de déclenchement — `listings_guard_derived`
-- avant `listings_guard_moderation` — ce qui tiendrait jusqu'au premier
-- renommage. Pour ces trois colonnes, l'énumération des droits est le seul
-- rempart, et c'est le même régime que les quatre tables de la migration 0044.
-- -----------------------------------------------------------------------------
create or replace function app.guard_listing_derived_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or app.is_admin() or app.recalcul_en_cours() then
    return new;
  end if;

  if new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count then
    raise exception 'Les notes se calculent à partir des avis reçus, elles ne s''écrivent pas.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger listings_guard_derived
  before update on public.listings
  for each row execute function app.guard_listing_derived_columns();

comment on function app.guard_listing_derived_columns() is
  'Second rempart sur listings.rating_avg et listings.rating_count. Le premier '
  'est l''énumération des droits de colonne ; celui-ci survit à un grant trop '
  'large reposé par mégarde. Migration 0047.';
