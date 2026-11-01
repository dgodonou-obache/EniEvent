-- =============================================================================
-- 0054 — Le plafond d'un tarif suit le prix le plus **haut** de l'annonce.
--
-- Signalé le 1er novembre 2026 : un partenaire voulant porter ses dates de
-- 100 000 à 250 000 F sur « Jardin de Fidjrossè » se voyait répondre
--
--     250 000 FCFA paraît très élevé pour cette annonce.
--     Le maximum accepté est 2 500 FCFA — vérifiez qu'il n'y a pas un zéro de trop.
--
-- 2 500 F, sur une annonce dont le calendrier portait au même instant
-- **125 dates à 100 000 F et 6 à 150 000 F**. La bande de sécurité contredisait
-- platement les données de l'annonce qu'elle prétendait protéger.
--
-- La cause est une erreur de conception, pas un cas particulier : le plancher
-- **et** le plafond se déduisaient tous deux de `listings.price_from`, qui est
-- un **minimum** — `min(pricing_rules.base_price)`, le « à partir de » du
-- catalogue. Bâtir un maximum sur un minimum donne une bande qui se referme
-- toute seule : il avait suffi d'une règle à 500 F, posée pour éprouver les
-- paiements réels, pour que le plafond tombe à 2 500 F.
--
-- ⚠️ **Et il n'y avait pas de retour.** Chaque baisse rabaissait le plafond, et
-- le plafond interdisait de remonter : le partenaire était enfermé dans le prix
-- le plus bas qu'il ait jamais saisi, sans qu'aucun écran ne lui dise pourquoi
-- ni comment en sortir. Un garde-fou qui empêche l'usage normal n'est plus un
-- garde-fou.
--
-- Le plancher reste donc sur le tarif d'entrée — c'est bien un minimum. Le
-- plafond passe sur le **sommet** de ce que l'annonce pratique déjà : son tarif
-- de base le plus cher, ou sa date la plus chère. Les deux bornes répondaient à
-- deux questions différentes ; les faire tenir sur un seul chiffre était
-- l'erreur.
--
-- Ce que cela ne change pas : une annonce neuve n'a qu'un seul tarif de base,
-- qui est à la fois son plus bas et son plus haut — sa bande vaut exactement ce
-- qu'elle valait. Et le zéro de trop reste attrapé : sur une annonce qui plafonne
-- à 150 000 F, 1 500 000 F est toujours refusé.
--
-- Double exact de `priceBand` (`src/lib/planning.ts`). L'application refuse
-- avant d'écrire pour formuler le refus en français ; la base refuse quoi qu'il
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
  sommet bigint;
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

  -- Le tarif d'entrée : le plus **bas** des tarifs de base. Il borne le bas.
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

  -- Le sommet : le plus **haut** de ce que l'annonce pratique déjà, tarifs de
  -- base et dates confondus. Il borne le haut.
  --
  -- ⚠️ Le déclencheur est `before` : la ligne en cours d'écriture ne compte pas
  -- dans ce maximum sur un `insert`, et compte pour son **ancienne** valeur sur
  -- un `update`. C'est ce qu'il faut — on se compare aux *autres* dates, pas à
  -- celle qu'on est en train de valider, sans quoi tout tarif se justifierait
  -- lui-même et le plafond ne refuserait plus rien.
  select greatest(
    coalesce(reference, 0),
    coalesce((select max(p.base_price) from public.pricing_rules p
               where p.listing_id = new.listing_id), 0),
    coalesce((select max(a.price) from public.availabilities a
               where a.listing_id = new.listing_id and a.price is not null), 0)
  ) into sommet;

  if sommet > 0 then
    plafond := round(sommet::numeric * 5)::bigint;

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
  'Bande de sécurité d''un tarif journalier : plancher sur le tarif d''entrée, plafond sur le tarif le plus haut. Double de priceBand (src/lib/planning.ts).';
