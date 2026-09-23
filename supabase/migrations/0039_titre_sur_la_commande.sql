-- =============================================================================
-- 0039 — Le nom de ce qu'on a réservé, figé sur la commande.
--
-- Dans « Mes réservations », le client lisait le nom de la **société** —
-- « Espaces Cotonou » — là où il attendait celui de ce qu'il a retenu —
-- « Jardin de Fidjrossè ». Personne ne réserve une société ; on réserve une
-- salle, un buffet, un orchestre. La messagerie fait déjà bien les deux :
-- l'enseigne en interlocuteur, l'annonce en contexte.
--
-- **Pourquoi une colonne, et non une jointure.** Deux raisons, et la seconde
-- compte plus que la première :
--
-- 1. `listings_select` (migration 0003) ne laisse lire une annonce que
--    `approved` et non suspendue. Un partenaire qui met la sienne en pause
--    ferait disparaître, du jour au lendemain, le nom de ce que ses clients ont
--    déjà réservé — sans erreur, sans trace, juste un blanc.
-- 2. Un titre se modifie. Une jointure vivante réécrirait **rétroactivement**
--    ce que le client croit avoir réservé : il a payé « Jardin de Fidjrossè »,
--    il lirait « Espace événementiel premium ». C'est le même principe que
--    `orders.total`, `commission_rate` et `cancellation_policy_id`, tous figés
--    à la commande : ce qui est vendu ne bouge plus.
--
-- Nul pour une commande née d'un devis sans annonce visée — l'interface
-- retombe alors sur l'enseigne, comme avant.
-- =============================================================================

alter table orders add column listing_title text;

comment on column orders.listing_title is
  'Nom de l''annonce au jour de la commande. Figé : une annonce renommée ou '
  'suspendue ne doit pas changer ce que le client croit avoir réservé.';

-- -----------------------------------------------------------------------------
-- Les commandes déjà passées
--
-- En superutilisateur, donc sans la restriction de `listings_select` : les
-- annonces suspendues comptent autant que les autres, ce sont justement celles
-- que la jointure vivante aurait perdues.
-- -----------------------------------------------------------------------------
update orders o
set listing_title = l.title
from listings l
where l.id = coalesce(o.listing_id, (select q.listing_id from quotes q where q.id = o.quote_id))
  and o.listing_title is null;

-- -----------------------------------------------------------------------------
-- Réservation immédiate
--
-- Recopie de la migration 0034, à une colonne près.
-- -----------------------------------------------------------------------------
create or replace function public.book_listing(annonce uuid, jours date[])
returns public.orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  fiche record;
  j date;
  tarif bigint;
  soustotal bigint := 0;
  taux numeric;
  nouvelle public.orders;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour réserver.' using errcode = 'insufficient_privilege';
  end if;

  if jours is null or array_length(jours, 1) is null then
    raise exception 'Choisissez au moins une date.' using errcode = 'check_violation';
  end if;

  if array_length(jours, 1) > 60 then
    raise exception 'Une réservation ne peut pas dépasser 60 jours.' using errcode = 'check_violation';
  end if;

  select l.id, l.org_id, l.title, l.status, l.is_paused, l.booking_mode, l.currency
  into fiche
  from public.listings l
  where l.id = annonce;

  if fiche.id is null then
    raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
  end if;

  if fiche.status <> 'approved' or fiche.is_paused then
    raise exception 'Cette annonce n''est pas réservable actuellement.'
      using errcode = 'check_violation';
  end if;

  if fiche.booking_mode not in ('instant', 'both') then
    raise exception 'Cette prestation se réserve sur devis.' using errcode = 'check_violation';
  end if;

  perform 1
  from public.availabilities
  where listing_id = annonce and date = any(jours)
  for update;

  foreach j in array jours loop
    tarif := app.price_for_date(annonce, j);

    if tarif is null then
      raise exception 'La date du % n''est plus disponible.', to_char(j, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;

    soustotal := soustotal + tarif;
  end loop;

  taux := app.commission_rate(fiche.org_id);

  -- **Le total est le prix affiché**, sans supplément d'aucune sorte
  -- (migration 0034), et le titre est celui lu sur la fiche ce jour-là.
  insert into public.orders (
    listing_id, listing_title, request_id, client_id, org_id,
    total, currency, commission_rate, event_date, start_date, end_date,
    cancellation_policy_id
  )
  values (
    annonce, fiche.title, null, auth.uid(), fiche.org_id,
    soustotal, coalesce(fiche.currency, 'XOF'), taux,
    (select min(x) from unnest(jours) x),
    (select min(x) from unnest(jours) x),
    (select max(x) from unnest(jours) x),
    app.policy_for_listing(annonce)
  )
  returning * into nouvelle;

  update public.availabilities
  set capacity_used = capacity_used + 1,
      status = case when capacity_used + 1 >= inventory then 'booked'::public.availability_status
                    else status end,
      updated_at = now()
  where listing_id = annonce and date = any(jours);

  perform app.build_instalments(nouvelle.id);

  perform app.log_event('order', nouvelle.id, 'book', null, 'pending_payment',
    jsonb_build_object('listing_id', annonce, 'jours', array_length(jours, 1),
                       'soustotal', soustotal));

  return nouvelle;
end;
$$;

revoke execute on function public.book_listing(uuid, date[]) from public, anon;
grant execute on function public.book_listing(uuid, date[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Devis accepté
--
-- La fonction est `SECURITY DEFINER` : elle lit le titre sans se heurter à
-- `listings_select`, ce qui compte pour une annonce déjà suspendue au moment
-- où le client accepte.
-- -----------------------------------------------------------------------------
create or replace function app.create_order_for_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  taux numeric;
  titre text;
  nouvelle uuid;
begin
  select r.id as request_id, r.requester_id as client_id, r.event_date as event_date,
         coalesce(new.listing_id, i.listing_id) as listing_id
  into ctx
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  where i.id = new.item_id;

  taux := app.commission_rate(new.org_id);

  select l.title into titre from public.listings l where l.id = ctx.listing_id;

  insert into public.orders (
    quote_id, request_id, client_id, org_id, total, currency, commission_rate,
    event_date, cancellation_policy_id, listing_title
  )
  values (
    new.id, ctx.request_id, ctx.client_id, new.org_id,
    new.subtotal, new.currency, taux, ctx.event_date,
    app.policy_for_listing(ctx.listing_id), titre
  )
  on conflict (quote_id) do nothing
  returning id into nouvelle;

  if nouvelle is not null then
    perform app.build_instalments(nouvelle);
  end if;

  return new;
end;
$$;
