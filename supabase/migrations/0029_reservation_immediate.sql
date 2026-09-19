-- =============================================================================
-- 0029 — Réservation immédiate.
--
-- Le bouton « Réserver » de la fiche annonce n'était relié à rien depuis le
-- lot 1 : ni `onClick`, ni formulaire, ni lien. Il se désactivait tant qu'aucune
-- date n'était choisie, ce qui donnait l'illusion d'un contrôle vivant ; une
-- fois les dates sélectionnées, il s'activait et ne faisait rien.
--
-- La cause est structurelle, pas cosmétique : `orders.quote_id` était
-- `not null`, donc une commande ne pouvait naître que d'un devis accepté. La
-- moitié « réservation immédiate » du double tunnel n'existait pas.
--
-- **Le prix est recalculé ici, jamais reçu du navigateur.** L'encart de
-- réservation affiche une estimation ; c'est un confort d'affichage. Le montant
-- qui engage est celui que cette fonction déduit du planning du prestataire —
-- exactement comme `start_payment` déduit le sien de la commande.
--
-- **Les dates sont bloquées à la réservation, pas au paiement.** Deux clients
-- ne doivent pas pouvoir retenir le même samedi pendant que l'un des deux
-- saisit sa carte. En contrepartie, une réservation jamais réglée doit libérer
-- ses dates : `public.release_stale_orders()` s'en charge, appelée par la tâche
-- planifiée. Sans elle, le premier panier abandonné condamnerait la date.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Une commande peut naître sans devis
-- -----------------------------------------------------------------------------
-- `request_id` autant que `quote_id` : une réservation immédiate ne vient
-- d'aucune demande de devis. Les deux étaient `not null` parce que la
-- migration 0026 ne connaissait que le tunnel d'appel d'offres.
alter table orders
  alter column quote_id drop not null,
  alter column request_id drop not null,
  add column listing_id uuid references listings (id) on delete restrict,
  add column start_date date,
  add column end_date date;

alter table orders
  add constraint order_has_an_origin
    check (quote_id is not null or listing_id is not null),
  add constraint order_dates_ordered
    check (end_date is null or start_date is null or end_date >= start_date);

create index orders_listing on orders (listing_id, start_date);

comment on column orders.listing_id is
  'Renseigné pour une réservation immédiate. Une commande vient d''un devis ou d''une annonce.';

-- -----------------------------------------------------------------------------
-- Frais de service acheteur
--
-- ⚠️ Provisoire, et en tension avec la commission partenaire : aujourd'hui le
-- client paierait 110 % et le partenaire toucherait 90 %, soit 20 % de
-- prélèvement total. Le barème reste donc réglable en base, et c'est une
-- décision à trancher avant toute mise en production.
-- -----------------------------------------------------------------------------
insert into app.runtime_config (key, value)
values ('service_fee_rate', '10')
on conflict (key) do nothing;

create or replace function app.service_fee_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value::numeric from app.runtime_config c
                   where c.key = 'service_fee_rate'), 10);
$$;

revoke execute on function app.service_fee_rate() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tarif d'une journée
--
-- Double exact de `priceForDate` (`src/lib/pricing.ts`) : le tarif saisi au
-- planning prime, à défaut le tarif de base majoré le week-end. `null` quand la
-- date n'est pas réservable — fermée, complète, ou sans tarif connu.
-- -----------------------------------------------------------------------------
create or replace function app.price_for_date(l uuid, d date)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dispo record;
  regle record;
  base bigint;
begin
  select * into dispo
  from public.availabilities
  where listing_id = l and date = d
  order by slot
  limit 1;

  -- Pas de ligne, fermée, ou déjà complète : la date n'est pas réservable.
  -- `capacity_used` porte le stock réellement pris ; s'arrêter au statut
  -- laisserait vendre deux fois le même samedi.
  if dispo.id is null or dispo.status <> 'open' or dispo.capacity_used >= dispo.inventory then
    return null;
  end if;

  if dispo.price is not null then
    return dispo.price;
  end if;

  select * into regle from public.pricing_rules where listing_id = l order by created_at limit 1;
  if regle.base_price is null then
    return null;
  end if;

  base := regle.base_price;

  -- Samedi et dimanche : `isodow` vaut 6 et 7.
  if extract(isodow from d) in (6, 7) and regle.weekend_multiplier is not null then
    return round(base::numeric * regle.weekend_multiplier)::bigint;
  end if;

  return base;
end;
$$;

revoke execute on function app.price_for_date(uuid, date) from public, anon;
-- Lisible par un utilisateur connecté : l'encart de réservation s'en sert pour
-- afficher la même estimation que celle qui engagera.
grant execute on function app.price_for_date(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Réserver
--
-- Le client ne fournit que l'annonce et les dates. Tout le reste — prix,
-- frais, partenaire, échéancier — est déduit ici.
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
  frais bigint;
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

  -- Une annonce non approuvée ou suspendue n'est pas vendable, même si son
  -- adresse circule encore.
  if fiche.status <> 'approved' or fiche.is_paused then
    raise exception 'Cette annonce n''est pas réservable actuellement.'
      using errcode = 'check_violation';
  end if;

  if fiche.booking_mode not in ('instant', 'both') then
    raise exception 'Cette prestation se réserve sur devis.' using errcode = 'check_violation';
  end if;

  -- Verrouillage puis relecture : deux clients qui valident la même seconde
  -- doivent être départagés, pas servis tous les deux.
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

  frais := round(soustotal::numeric * app.service_fee_rate() / 100)::bigint;
  taux := app.commission_rate(fiche.org_id);

  insert into public.orders (
    listing_id, request_id, client_id, org_id,
    total, currency, commission_rate, event_date, start_date, end_date
  )
  values (
    annonce, null, auth.uid(), fiche.org_id,
    soustotal + frais, coalesce(fiche.currency, 'XOF'), taux,
    (select min(x) from unnest(jours) x),
    (select min(x) from unnest(jours) x),
    (select max(x) from unnest(jours) x)
  )
  returning * into nouvelle;

  -- Les dates sont retenues immédiatement. `release_stale_orders` les rendra
  -- si le paiement n'aboutit pas.
  update public.availabilities
  set capacity_used = capacity_used + 1,
      status = case when capacity_used + 1 >= inventory then 'booked'::public.availability_status
                    else status end,
      updated_at = now()
  where listing_id = annonce and date = any(jours);

  perform app.build_instalments(nouvelle.id);

  perform app.log_event('order', nouvelle.id, 'book', null, 'pending_payment',
    jsonb_build_object('listing_id', annonce, 'jours', array_length(jours, 1),
                       'soustotal', soustotal, 'frais', frais));

  return nouvelle;
end;
$$;

revoke execute on function public.book_listing(uuid, date[]) from public, anon;
grant execute on function public.book_listing(uuid, date[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Libération des réservations abandonnées
--
-- Sans elle, le premier panier abandonné condamnerait la date pour toujours.
-- Une demi-heure laisse le temps de payer sans immobiliser un samedi.
-- -----------------------------------------------------------------------------
create or replace function public.release_stale_orders(delai interval default interval '30 minutes')
returns int
language plpgsql
set search_path = ''
as $$
declare
  cmd record;
  liberees int := 0;
begin
  for cmd in
    select o.id, o.listing_id, o.start_date, o.end_date
    from public.orders o
    where o.status = 'pending_payment'
      and o.listing_id is not null
      and o.created_at < now() - delai
      -- Une tentative de paiement en cours mérite qu'on patiente.
      and not exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.status in ('pending', 'paid')
          and p.updated_at > now() - delai
      )
  loop
    update public.availabilities
    set capacity_used = greatest(0, capacity_used - 1),
        status = case when status = 'booked' then 'open'::public.availability_status else status end,
        updated_at = now()
    where listing_id = cmd.listing_id
      and date between cmd.start_date and cmd.end_date;

    update public.orders set status = 'cancelled', updated_at = now() where id = cmd.id;

    perform app.log_event('order', cmd.id, 'release', 'pending_payment', 'cancelled',
      jsonb_build_object('motif', 'paiement non abouti'));

    liberees := liberees + 1;
  end loop;

  return liberees;
end;
$$;

revoke execute on function public.release_stale_orders(interval) from public, anon, authenticated;
grant execute on function public.release_stale_orders(interval) to service_role;

comment on function public.release_stale_orders(interval) is
  'Annule les réservations immédiates jamais réglées et rend leurs dates.';
