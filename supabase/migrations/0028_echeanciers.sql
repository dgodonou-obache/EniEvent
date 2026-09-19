-- =============================================================================
-- 0028 — Échéanciers de paiement.
--
-- L'acompte unique de la migration 0026 ne décrit pas l'événementiel réel : un
-- loueur de salle demande 30 % à la réservation et le solde une semaine avant,
-- un traiteur veut un montant fixe pour bloquer la date puis le reste à
-- quinze jours. Chaque partenaire compose donc **sa propre suite d'échéances**.
--
-- Une échéance se dit en deux temps :
--
-- - **quand** : à la réservation, ou X jours avant l'événement ;
-- - **combien** : un pourcentage du total, un montant fixe, ou *le solde*.
--
-- **Le solde est ce qui garantit l'exactitude.** Il n'est jamais calculé : il
-- vaut ce qui reste. C'est le même principe que `fees.ts` — une part est
-- calculée, l'autre est le reste — et c'est ce qui rend impossible qu'un
-- échéancier réclame plus ou moins que le total. Tout échéancier en comporte
-- un, et un seul, en dernière position.
--
-- **L'échéancier est recopié sur la commande** (`order_instalments`). Le
-- partenaire peut changer ses conditions le lendemain ; une commande déjà
-- passée ne doit pas bouger.
--
-- Restructuration assumée plutôt que superposition : `payments.purpose` et
-- `orders.deposit_*` disparaissent. Aucun paiement n'avait encore été encaissé.
-- =============================================================================

create type schedule_trigger as enum ('booking', 'before_event');
create type schedule_amount as enum ('percent', 'fixed', 'balance');

-- -----------------------------------------------------------------------------
-- Les conditions du partenaire
-- -----------------------------------------------------------------------------
create table payment_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  position smallint not null check (position >= 0),

  label text not null,
  trigger schedule_trigger not null,
  -- Nombre de jours avant l'événement. Nul pour une échéance à la réservation.
  days_before int check (days_before is null or days_before between 0 and 365),

  amount_kind schedule_amount not null,
  percent numeric(5, 2) check (percent is null or percent between 0 and 100),
  fixed_amount bigint check (fixed_amount is null or fixed_amount >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, position),

  constraint days_required_before_event
    check (trigger <> 'before_event' or days_before is not null),

  -- Une valeur, et une seule, selon la nature : un pourcentage *et* un montant
  -- fixe sur la même ligne laisserait le calcul décider lequel compte.
  constraint value_matches_kind check (
    (amount_kind = 'percent'  and percent is not null and fixed_amount is null)
    or (amount_kind = 'fixed'    and fixed_amount is not null and percent is null)
    or (amount_kind = 'balance'  and percent is null and fixed_amount is null)
  )
);

create index payment_schedules_org on payment_schedules (org_id, position);

comment on table payment_schedules is
  'Conditions de règlement d''un partenaire. La dernière ligne est toujours le solde.';

-- -----------------------------------------------------------------------------
-- Échéances d'une commande — copie figée
-- -----------------------------------------------------------------------------
create table order_instalments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  position smallint not null check (position >= 0),

  label text not null,
  amount bigint not null check (amount > 0),
  -- Nulle quand l'événement n'a pas encore de date : l'échéance existe, son
  -- jour n'est pas encore connu.
  due_date date,

  created_at timestamptz not null default now(),

  unique (order_id, position)
);

create index order_instalments_order on order_instalments (order_id, position);

-- -----------------------------------------------------------------------------
-- Les paiements visent une échéance
-- -----------------------------------------------------------------------------
drop index if exists payments_one_paid_per_purpose;

alter table payments
  drop column purpose,
  add column instalment_id uuid not null references order_instalments (id) on delete restrict;

-- La garantie qui compte : on peut réessayer autant qu'on veut, jamais
-- encaisser deux fois la même échéance.
create unique index payments_one_paid_per_instalment
  on payments (instalment_id)
  where status = 'paid';

-- Ces colonnes décrivaient l'acompte unique : l'échéancier les remplace, et
-- les garder ferait deux sources de vérité pour le même montant.
alter table orders
  drop column deposit_percent,
  drop column deposit_amount;

alter table partner_profiles drop column deposit_percent;

-- L'ancienne signature porte le type dans ses paramètres : la supprimer d'abord,
-- sinon le type refuse de partir et l'erreur ne nomme pas le coupable.
drop function if exists public.start_payment(uuid, public.payment_purpose, text);

drop type payment_purpose;

-- -----------------------------------------------------------------------------
-- Échéancier par défaut
--
-- Un partenaire qui n'a rien réglé doit malgré tout pouvoir être payé. 30 % à
-- la réservation et le solde une semaine avant : l'usage le plus courant.
-- -----------------------------------------------------------------------------
create or replace function app.seed_default_schedule(org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.payment_schedules (org_id, position, label, trigger, days_before, amount_kind, percent)
  values
    (org, 0, 'Acompte à la réservation', 'booking', null, 'percent', 30),
    (org, 1, 'Solde', 'before_event', 7, 'balance', null)
  on conflict (org_id, position) do nothing;
$$;

revoke execute on function app.seed_default_schedule(uuid) from public, anon, authenticated;

-- Les partenaires déjà inscrits en héritent.
do $$
declare
  o record;
begin
  for o in
    select id from public.organizations
    where type = 'partner'
      and not exists (select 1 from public.payment_schedules s where s.org_id = organizations.id)
  loop
    perform app.seed_default_schedule(o.id);
  end loop;
end
$$;

-- Tout nouveau partenaire aussi, dès la création de son organisation.
create or replace function app.schedule_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'partner' then
    perform app.seed_default_schedule(new.id);
  end if;
  return new;
end;
$$;

create trigger organizations_default_schedule
  after insert on organizations
  for each row execute function app.schedule_for_new_org();

-- -----------------------------------------------------------------------------
-- Construction des échéances d'une commande
--
-- Le total est partagé dans l'ordre des positions. Un pourcentage porte sur le
-- **total**, jamais sur le reste — c'est la lecture intuitive, et la seule que
-- le partenaire puisse vérifier de tête. Le solde ramasse ce qui n'a pas été
-- distribué, ce qui rend l'égalité exacte par construction.
--
-- Une échéance nulle n'est pas créée : proposer de régler zéro franc se lirait
-- comme un défaut.
-- -----------------------------------------------------------------------------
create or replace function app.build_instalments(cmd uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  commande public.orders;
  ligne record;
  reste bigint;
  montant bigint;
  rang smallint := 0;
  echeance date;
begin
  select * into commande from public.orders where id = cmd;
  if commande.id is null then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;

  reste := commande.total;

  for ligne in
    select * from public.payment_schedules where org_id = commande.org_id order by position
  loop
    montant := case ligne.amount_kind
      when 'percent' then round(commande.total::numeric * ligne.percent / 100)::bigint
      when 'fixed' then ligne.fixed_amount
      else reste
    end;

    -- Un montant fixe supérieur à ce qui reste ne doit pas rendre l'échéancier
    -- plus cher que la commande : il est ramené au reste.
    if montant > reste then montant := reste; end if;
    if montant <= 0 then continue; end if;

    echeance := case
      when ligne.trigger = 'booking' then current_date
      when commande.event_date is null then null
      else commande.event_date - ligne.days_before
    end;

    insert into public.order_instalments (order_id, position, label, amount, due_date)
    values (cmd, rang, ligne.label, montant, echeance);

    reste := reste - montant;
    rang := rang + 1;
  end loop;

  -- Aucune ligne exploitable — échéancier vide, ou entièrement à zéro : on ne
  -- laisse pas une commande sans aucun moyen d'être réglée.
  if rang = 0 and commande.total > 0 then
    insert into public.order_instalments (order_id, position, label, amount, due_date)
    values (cmd, 0, 'Paiement intégral', commande.total, current_date);
    reste := 0;
  end if;

  -- Filet : si un échéancier sans solde n'a pas tout distribué, le reliquat
  -- rejoint la dernière échéance plutôt que de disparaître.
  if reste > 0 and rang > 0 then
    update public.order_instalments
    set amount = amount + reste
    where order_id = cmd and position = rang - 1;
  end if;
end;
$$;

revoke execute on function app.build_instalments(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Naissance de la commande — désormais avec ses échéances
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
  nouvelle uuid;
begin
  select r.id as request_id, r.requester_id as client_id, r.event_date as event_date
  into ctx
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  where i.id = new.item_id;

  taux := app.commission_rate(new.org_id);

  insert into public.orders (
    quote_id, request_id, client_id, org_id, total, currency, commission_rate, event_date
  )
  values (
    new.id, ctx.request_id, ctx.client_id, new.org_id,
    new.subtotal, new.currency, taux, ctx.event_date
  )
  on conflict (quote_id) do nothing
  returning id into nouvelle;

  if nouvelle is not null then
    perform app.build_instalments(nouvelle);
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ouverture d'un paiement — sur une échéance
--
-- **Le montant reste déduit de la base.** L'appelant ne désigne qu'une
-- échéance ; la somme vient de la ligne, figée à la commande.
-- -----------------------------------------------------------------------------

create or replace function public.start_payment(echeance uuid, cle text)
returns public.payments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ech public.order_instalments;
  cmd public.orders;
  com bigint;
  precedentes int;
  ligne public.payments;
begin
  select * into ech from public.order_instalments where id = echeance;
  if ech.id is null then
    raise exception 'Échéance introuvable.' using errcode = 'no_data_found';
  end if;

  select * into cmd from public.orders where id = ech.order_id;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if cmd.client_id <> auth.uid() then
    raise exception 'Seul le client de cette commande peut la régler.'
      using errcode = 'insufficient_privilege';
  end if;

  if cmd.status not in ('pending_payment', 'deposit_paid') then
    raise exception 'Cette commande n''attend plus de paiement (état : %).', cmd.status
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.payments p
    where p.instalment_id = echeance and p.status = 'paid'
  ) then
    raise exception 'Cette échéance a déjà été réglée.' using errcode = 'unique_violation';
  end if;

  -- Les échéances se règlent dans l'ordre : payer le solde avant l'acompte
  -- laisserait une commande à moitié réglée que plus rien ne réclame.
  select count(*) into precedentes
  from public.order_instalments i
  where i.order_id = ech.order_id
    and i.position < ech.position
    and not exists (
      select 1 from public.payments p where p.instalment_id = i.id and p.status = 'paid'
    );

  if precedentes > 0 then
    raise exception 'Réglez d''abord l''échéance précédente.' using errcode = 'check_violation';
  end if;

  com := round(ech.amount::numeric * cmd.commission_rate / 100)::bigint;

  insert into public.payments (order_id, instalment_id, amount, currency, commission, partner_due, idempotency_key)
  values (ech.order_id, echeance, ech.amount, cmd.currency, com, ech.amount - com, cle)
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into ligne;

  perform app.log_event('payment', ligne.id, 'start', null, 'pending',
    jsonb_build_object('order_id', ech.order_id, 'instalment_id', echeance, 'amount', ech.amount));

  return ligne;
end;
$$;

revoke execute on function public.start_payment(uuid, text) from public, anon;
grant execute on function public.start_payment(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Dénouement — l'état de la commande se déduit des échéances
-- -----------------------------------------------------------------------------
create or replace function public.settle_payment(
  cle text,
  ref_prestataire text,
  etat_prestataire text,
  encaisse boolean,
  montant_constate bigint default null,
  detail text default null
)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  ligne public.payments;
  restantes int;
begin
  select * into ligne from public.payments where idempotency_key = cle;

  if ligne.id is null then
    raise exception 'Paiement introuvable pour cette clé.' using errcode = 'no_data_found';
  end if;

  if ligne.status = 'paid' then
    return ligne;
  end if;

  if encaisse and montant_constate is not null and montant_constate <> ligne.amount then
    update public.payments
    set status = 'failed',
        provider_ref = ref_prestataire,
        provider_status = etat_prestataire,
        last_error = format('Montant constaté %s, attendu %s', montant_constate, ligne.amount),
        updated_at = now()
    where id = ligne.id
    returning * into ligne;

    perform app.log_event('payment', ligne.id, 'amount_mismatch', 'pending', 'failed',
      jsonb_build_object('constate', montant_constate, 'attendu', ligne.amount));
    return ligne;
  end if;

  update public.payments
  set status = case when encaisse then 'paid'::public.payment_status else 'failed'::public.payment_status end,
      provider_ref = ref_prestataire,
      provider_status = etat_prestataire,
      last_error = detail,
      paid_at = case when encaisse then now() else paid_at end,
      updated_at = now()
  where id = ligne.id
  returning * into ligne;

  if not encaisse then
    perform app.log_event('payment', ligne.id, 'settle', 'pending', 'failed',
      jsonb_build_object('provider_status', etat_prestataire));
    return ligne;
  end if;

  -- Reste-t-il une échéance non réglée ? C'est elle, et non un compteur
  -- d'acomptes, qui dit si la commande est soldée.
  select count(*) into restantes
  from public.order_instalments i
  where i.order_id = ligne.order_id
    and not exists (
      select 1 from public.payments p where p.instalment_id = i.id and p.status = 'paid'
    );

  update public.orders
  set status = case when restantes = 0 then 'paid'::public.order_status
                    else 'deposit_paid'::public.order_status end,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = ligne.order_id;

  perform app.log_event('payment', ligne.id, 'settle', 'pending', 'paid',
    jsonb_build_object('order_id', ligne.order_id, 'amount', ligne.amount,
                       'commission', ligne.commission, 'partner_due', ligne.partner_due,
                       'echeances_restantes', restantes));

  return ligne;
end;
$$;

revoke execute on function public.settle_payment(text, text, text, boolean, bigint, text)
  from public, anon, authenticated;
grant execute on function public.settle_payment(text, text, text, boolean, bigint, text) to service_role;

-- -----------------------------------------------------------------------------
-- Enregistrement de l'échéancier par le partenaire
--
-- Remplacement complet plutôt que modification ligne à ligne : un échéancier
-- se lit comme un tout, et une mise à jour partielle pourrait le laisser sans
-- solde — donc incapable de réclamer la totalité.
-- -----------------------------------------------------------------------------
create or replace function public.save_payment_schedule(org uuid, lignes jsonb)
returns setof public.payment_schedules
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l jsonb;
  rang smallint := 0;
  soldes int := 0;
begin
  if not app.is_org_member(org) then
    raise exception 'Vous n''appartenez pas à cette organisation.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(lignes) <> 'array' or jsonb_array_length(lignes) = 0 then
    raise exception 'Un échéancier comporte au moins une ligne.' using errcode = 'check_violation';
  end if;

  for l in select * from jsonb_array_elements(lignes) loop
    if l ->> 'amount_kind' = 'balance' then soldes := soldes + 1; end if;
  end loop;

  -- Sans solde, rien ne réclamerait le reliquat d'un arrondi ; avec deux, le
  -- second vaudrait toujours zéro.
  if soldes <> 1 then
    raise exception 'Un échéancier comporte exactement une ligne « solde ».'
      using errcode = 'check_violation';
  end if;

  if (lignes -> (jsonb_array_length(lignes) - 1) ->> 'amount_kind') <> 'balance' then
    raise exception 'La ligne « solde » doit être la dernière.' using errcode = 'check_violation';
  end if;

  delete from public.payment_schedules where org_id = org;

  for l in select * from jsonb_array_elements(lignes) loop
    insert into public.payment_schedules
      (org_id, position, label, trigger, days_before, amount_kind, percent, fixed_amount)
    values (
      org,
      rang,
      coalesce(nullif(btrim(l ->> 'label'), ''), 'Échéance'),
      (l ->> 'trigger')::public.schedule_trigger,
      nullif(l ->> 'days_before', '')::int,
      (l ->> 'amount_kind')::public.schedule_amount,
      nullif(l ->> 'percent', '')::numeric,
      nullif(l ->> 'fixed_amount', '')::bigint
    );
    rang := rang + 1;
  end loop;

  perform app.log_event('payment_schedule', org, 'save', null, null,
    jsonb_build_object('lignes', jsonb_array_length(lignes)));

  return query select * from public.payment_schedules where org_id = org order by position;
end;
$$;

revoke execute on function public.save_payment_schedule(uuid, jsonb) from public, anon;
grant execute on function public.save_payment_schedule(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Les conditions d'un partenaire ne sont pas un secret : un client doit pouvoir
-- lire l'échéancier avant de s'engager. L'écriture passe par la fonction.
-- -----------------------------------------------------------------------------
alter table payment_schedules enable row level security;
alter table order_instalments enable row level security;

grant select on payment_schedules to anon, authenticated;
grant select on order_instalments to authenticated;

create policy payment_schedules_select on payment_schedules for select using (true);

create policy order_instalments_select on order_instalments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_instalments.order_id
        and (o.client_id = auth.uid() or app.is_org_member(o.org_id) or app.is_admin())
    )
  );
