-- =============================================================================
-- 0030 — Bande de sécurité sur les tarifs du planning.
--
-- `app.enforce_min_price` (migration 0003) ne se déclenchait que si
-- `listings.min_price` était renseigné. Ce champ est **facultatif**, et six
-- annonces sur quinze le laissaient vide : la protection était conditionnée à
-- une saisie que personne ne fait. Un tarif de **10 francs** est passé sans un
-- mot, et s'est retrouvé dans le calendrier d'un client.
--
-- La bande se déduit désormais de l'annonce elle-même :
--
-- - plancher absolu — aucune date ne se vend en dessous, même sans référence ;
-- - plancher relatif — un cinquième du tarif de référence, ce qui attrape la
--   faute de frappe classique (15 000 saisi pour 150 000) ;
-- - plafond — cinq fois la référence, qui attrape le zéro de trop.
--
-- Un `min_price` explicitement saisi **prime** : le partenaire qui l'a réglé a
-- pris une décision, et elle vaut mieux qu'une déduction.
--
-- Double exact de `priceBand` (`src/lib/planning.ts`). L'application refuse
-- avant d'écrire pour donner un message utile ; la base refuse quoi qu'il
-- arrive, y compris à un appel direct de l'API.
-- =============================================================================

create or replace function app.enforce_min_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fiche record;
  reference bigint;
  plancher bigint;
  plafond bigint;
  -- Aucune date ne se vend en dessous, quelle que soit l'annonce.
  plancher_absolu constant bigint := 1000;
begin
  if new.price is null or new.status <> 'open' then
    return new;
  end if;

  select l.min_price, l.price_from into fiche
  from public.listings l where l.id = new.listing_id;

  reference := fiche.price_from;

  -- ⚠️ Le plancher absolu ne s'applique **que** faute de référence. Le
  -- combiner avec le plancher relatif condamnerait les annonces légitimement
  -- bon marché : « Décoration dot » se vend 344 FCFA l'unité, et un plancher
  -- de 1 000 l'aurait rendue impossible à planifier.
  if fiche.min_price is not null then
    plancher := fiche.min_price;
  elsif reference is not null then
    plancher := round(reference::numeric * 0.2)::bigint;
  else
    plancher := plancher_absolu;
  end if;

  if new.price < plancher then
    raise exception
      'Tarif % trop bas pour cette annonce : le minimum accepté est %.', new.price, plancher
      using errcode = 'check_violation';
  end if;

  if reference is not null then
    plafond := round(reference::numeric * 5)::bigint;

    if new.price > plafond then
      raise exception
        'Tarif % trop élevé pour cette annonce : le maximum accepté est %.', new.price, plafond
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function app.enforce_min_price() is
  'Bande de sécurité d''un tarif journalier. Double de priceBand (src/lib/planning.ts).';

-- -----------------------------------------------------------------------------
-- Les tarifs déjà saisis hors bande
--
-- On ne les corrige pas : un tarif est une décision commerciale, et deviner à
-- la place du partenaire serait pire que le laisser aberrant. On les signale,
-- pour que l'administration puisse les traiter.
-- -----------------------------------------------------------------------------
do $$
declare
  hors_bande int;
begin
  select count(*) into hors_bande
  from public.availabilities a
  join public.listings l on l.id = a.listing_id
  where a.price is not null
    and a.status = 'open'
    and a.price < case when l.price_from is not null
                       then round(l.price_from::numeric * 0.2)::bigint
                       else 1000 end;

  if hors_bande > 0 then
    raise warning 'Attention : % tarif(s) déjà en base sont sous le nouveau plancher.', hors_bande;
  end if;
end
$$;
