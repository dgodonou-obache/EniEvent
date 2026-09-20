-- =============================================================================
-- 0032 — Annulation et remboursement.
--
-- La chaîne de l'argent n'allait que dans un sens : un client payait, et rien
-- ne permettait de revenir en arrière. Les barèmes existaient pourtant depuis
-- la migration 0003 — `cancellation_policies` et `cancellation_rules` portent
-- « X jours avant, Y % remboursé » — et **aucune ligne de code ne les lisait**.
-- Les fiches annonce affichaient une politique que le système était incapable
-- d'appliquer.
--
-- Six décisions portent tout ce qui suit.
--
-- 1. **La politique est figée sur la commande**, comme `commission_rate`
--    (migration 0026). Un partenaire peut durcir ses conditions le lendemain ;
--    le client s'est engagé sur celles affichées le jour de sa réservation.
--
-- 2. **Le barème porte sur le total, le remboursement sur ce qui a été payé.**
--    « La moitié du montant reste due » décrit ce que le partenaire garde, pas
--    ce qu'on rend. On retient donc `total × (100 − taux)`, **plafonné à ce qui
--    a réellement été encaissé**, et on rend le reste. La plateforme ne réclame
--    jamais un complément : elle n'a aucun moyen de le recouvrer, et une dette
--    envoyée à un client qui vient d'annuler ne serait jamais payée.
--
-- 3. **Un partenaire qui annule rembourse intégralement.** Le barème protège le
--    prestataire contre le changement d'avis du client ; l'invoquer pour se
--    désister soi-même reviendrait à facturer sa propre défaillance.
--
-- 4. **On n'annule pas après la prestation.** Une fois la date passée, il n'y a
--    plus rien à annuler — seulement un litige, qui relève d'un geste humain.
--    Seule l'administration garde la main.
--
-- 5. **Les versements attendent l'événement.** C'est la contrepartie de tout le
--    reste : `payments.payout_id` empêchait de payer **deux fois**, rien
--    n'empêchait de payer **trop tôt**. Un acompte réglé trois mois avant un
--    mariage était versable le jour même ; le client annulait ensuite dans les
--    règles, et l'argent était déjà parti. Une annulation, elle, libère
--    immédiatement ce qui a été retenu : elle est définitive, plus rien ne
--    viendra après.
--
--    Les deux règles sont complémentaires : **on ne peut jamais rembourser et
--    verser la même somme**, puisque l'une se ferme quand l'autre s'ouvre.
--
-- 6. **Rembourser une somme déjà versée ne se compense pas en silence.** Le cas
--    ne devrait plus se produire (règle 5), mais s'il se produit, le versement
--    est signalé à récupérer auprès du partenaire plutôt que déduit en douce
--    d'un versement futur — un solde qui devient négatif tout seul est la
--    meilleure façon de perdre la confiance d'un prestataire.
--
-- **Le remboursement est un registre, pas un virement.** `/refunds` de FedaPay
-- répond **401** sur ce compte, là où `/transactions` et `/currencies`
-- répondent 200 avec la même clé : le droit de rembourser n'est pas accordé,
-- exactement comme `/payouts` (403, migration 0031). Même réponse, donc :
-- consigner ce qu'on doit, le payer par les moyens du bord, en garder la trace.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La politique, figée sur la commande
-- -----------------------------------------------------------------------------
alter table orders
  add column cancellation_policy_id uuid references cancellation_policies (id) on delete restrict,
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add column cancelled_by uuid references profiles (id) on delete set null;

comment on column orders.cancellation_policy_id is
  'Barème d''annulation au jour de la commande. Figé : les conditions du '
  'partenaire peuvent changer, celles de cette commande ne doivent pas.';

-- Toute commande doit en avoir une, sans quoi le calcul d'un remboursement
-- dépendrait d'un cas nul — et un cas nul en matière d'argent se tranche
-- toujours au détriment de quelqu'un.
create or replace function app.policy_for_listing(annonce uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.cancellation_policy_id from public.listings l where l.id = annonce),
    (select p.id from public.cancellation_policies p where p.slug = 'moderee')
  );
$$;

revoke execute on function app.policy_for_listing(uuid) from public, anon, authenticated;

comment on function app.policy_for_listing(uuid) is
  'Barème d''une annonce, à défaut le barème modéré de la plateforme.';

-- Les commandes déjà passées en héritent : sans cela, elles resteraient les
-- seules qu''on ne saurait pas annuler.
update orders o
set cancellation_policy_id = app.policy_for_listing(
  coalesce(o.listing_id, (select q.listing_id from quotes q where q.id = o.quote_id))
)
where o.cancellation_policy_id is null;

-- -----------------------------------------------------------------------------
-- Lecture du barème
--
-- Les règles se lisent « à partir de X jours avant, ce taux s'applique ». On
-- retient donc la plus exigeante des règles atteintes : le plus grand
-- `min_days_before` inférieur ou égal au délai restant.
--
-- **Après l'événement, le taux est nul** : aucune règle n'a un
-- `min_days_before` négatif, le `coalesce` tranche à zéro. C'est voulu — une
-- prestation rendue ne se rembourse pas au barème.
--
-- **Sans date d'événement, le taux est le plus favorable.** Un devis accepté
-- peut n'en porter aucune. Retenir un délai dépassé qu'on ne sait pas prouver
-- reviendrait à facturer une pénalité au hasard.
-- -----------------------------------------------------------------------------
create or replace function app.refund_percent(
  politique uuid,
  jour_evenement date,
  le_jour date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select r.refund_percent
      from public.cancellation_rules r
      where r.policy_id = politique
        -- 36500 jours — un siècle — tient lieu de « très loin devant » quand la
        -- date est inconnue, et atteint donc la règle la plus généreuse.
        and r.min_days_before <= coalesce(jour_evenement - le_jour, 36500)
      order by r.min_days_before desc
      limit 1
    ),
    0
  );
$$;

revoke execute on function app.refund_percent(uuid, date, date) from public, anon;
-- Lisible par un connecté : l'écran doit annoncer le remboursement **avant**
-- que le client ne confirme son annulation.
grant execute on function app.refund_percent(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Les remboursements
-- -----------------------------------------------------------------------------
create type refund_status as enum ('pending', 'sent', 'failed', 'cancelled');

create table refunds (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('RMB'),

  -- Une annulation par commande : la contrainte d'unicité est ce qui empêche
  -- un second passage de rembourser deux fois.
  order_id uuid not null unique references orders (id) on delete restrict,
  client_id uuid not null references profiles (id) on delete restrict,
  org_id uuid not null references organizations (id) on delete restrict,

  amount bigint not null check (amount > 0),
  currency text not null default 'XOF',

  -- Conservés pour la trace : le barème peut être modifié ensuite, la raison
  -- pour laquelle ce client a touché cette somme, non.
  refund_percent numeric(5, 2) not null check (refund_percent between 0 and 100),
  policy_id uuid references cancellation_policies (id) on delete set null,
  reason text,
  requested_by uuid references profiles (id) on delete set null,

  -- Vrai quand une partie de la somme rendue avait déjà été versée au
  -- partenaire. Ne se compense pas tout seul : il faut aller la lui redemander.
  needs_recovery boolean not null default false,

  status refund_status not null default 'pending',
  provider_ref text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index refunds_status on refunds (status, created_at);
create index refunds_org on refunds (org_id, created_at desc);

comment on table refunds is
  'Ce que la plateforme doit rendre à un client après annulation. '
  'Le virement se fait à la main : FedaPay refuse /refunds sur ce compte.';

-- -----------------------------------------------------------------------------
-- Ce que chaque encaissement rend
--
-- Sans ces lignes, on saurait combien rendre au client mais pas **sur quoi** :
-- donc ni ce qui reste dû au partenaire, ni si la somme lui avait déjà été
-- versée. C'est le pendant exact de `payments.payout_id`.
-- -----------------------------------------------------------------------------
create table refund_lines (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds (id) on delete cascade,
  payment_id uuid not null references payments (id) on delete restrict,

  amount bigint not null check (amount > 0),
  -- `commission + partner_due = amount`, comme sur un encaissement : la
  -- reprise se ventile exactement comme la prise.
  commission bigint not null check (commission >= 0),
  partner_due bigint not null check (partner_due >= 0),

  -- Figé à l'écriture : le versement peut être annulé ensuite, le fait que
  -- l'argent était parti au moment du remboursement, non.
  was_paid_out boolean not null default false,

  created_at timestamptz not null default now(),

  unique (refund_id, payment_id),
  constraint refund_split_is_exact check (commission + partner_due = amount)
);

create index refund_lines_payment on refund_lines (payment_id);

-- -----------------------------------------------------------------------------
-- Part d'un encaissement déjà rendue au client
--
-- « Ce qui reste dû au partenaire » est une soustraction, et elle se pose à la
-- base — même principe que `payments.payout_id` : la recalculer à l'écran
-- ouvrirait la porte à deux réponses différentes pour la même question.
-- -----------------------------------------------------------------------------
create or replace function app.refunded_partner_due(encaissement uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.partner_due), 0)::bigint
  from public.refund_lines l
  where l.payment_id = encaissement;
$$;

revoke execute on function app.refunded_partner_due(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Quand un encaissement devient versable
--
-- Trois cas, dans cet ordre :
--
-- - **Commande annulée** : versable immédiatement. L'annulation est définitive,
--   ce qui a été retenu est acquis au partenaire, et le faire attendre la date
--   d'un événement qui n'aura pas lieu n'aurait aucun sens.
-- - **Date connue** : le lendemain de la prestation, plus le délai de garde.
--   Tant que la date n'est pas passée, le client peut encore annuler.
-- - **Date inconnue** : trente jours après la commande. Faute de savoir quand
--   la prestation a eu lieu, c'est le repli prudent — il est rare, un devis
--   comme une réservation portant presque toujours une date.
-- -----------------------------------------------------------------------------
insert into app.runtime_config (key, value)
values ('payout_hold_days', '0')
on conflict (key) do nothing;

create or replace function app.order_payout_ready(commande uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.status in ('cancelled', 'refunded') then true
    when coalesce(o.end_date, o.event_date) is not null then
      coalesce(o.end_date, o.event_date)
        + coalesce((select c.value::int from app.runtime_config c
                    where c.key = 'payout_hold_days'), 0)
        < current_date
    else o.created_at < now() - interval '30 days'
  end
  from public.orders o
  where o.id = commande;
$$;

revoke execute on function app.order_payout_ready(uuid) from public, anon, authenticated;

comment on function app.order_payout_ready(uuid) is
  'Vrai quand plus aucun remboursement ne peut venir reprendre cet argent.';

-- -----------------------------------------------------------------------------
-- Annuler
--
-- Le montant n'est **jamais** un paramètre, exactement comme pour
-- `start_payment` : il se déduit du barème figé, de la date, et de ce qui a
-- réellement été encaissé. Laisser l'appelant proposer une somme rendrait
-- inutile tout contrôle en aval.
-- -----------------------------------------------------------------------------
create type cancellation_outcome as (
  order_id uuid,
  status order_status,
  refund_percent numeric,
  paid bigint,
  retained bigint,
  refunded bigint,
  refund_id uuid,
  needs_recovery boolean
);

create or replace function public.cancel_order(cible uuid, motif text default null)
returns public.cancellation_outcome
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cmd public.orders;
  acteur text;
  jour date;
  taux numeric;
  regle bigint;
  retenu bigint;
  rembourse bigint;
  reste bigint;
  part bigint;
  com bigint;
  pay record;
  r public.refunds;
  recuperer boolean := false;
  final public.order_status;
  sortie public.cancellation_outcome;
begin
  select * into cmd from public.orders where id = cible;

  if cmd.id is null then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if cmd.client_id = auth.uid() then
    acteur := 'client';
  elsif app.is_org_member(cmd.org_id) then
    acteur := 'partner';
  elsif app.is_admin() then
    acteur := 'admin';
  else
    raise exception 'Vous ne pouvez pas annuler cette réservation.'
      using errcode = 'insufficient_privilege';
  end if;

  if cmd.status in ('cancelled', 'refunded') then
    raise exception 'Cette réservation est déjà annulée.' using errcode = 'check_violation';
  end if;

  jour := coalesce(cmd.end_date, cmd.event_date);

  -- Une prestation rendue ne s'annule pas : ce qui se discute après coup est un
  -- litige, et un litige se tranche à la main.
  if acteur <> 'admin' and jour is not null and jour < current_date then
    raise exception 'Cette prestation a déjà eu lieu : contactez-nous pour toute contestation.'
      using errcode = 'check_violation';
  end if;

  -- Le barème protège le prestataire du changement d'avis du client. S'en
  -- servir pour se désister soi-même reviendrait à facturer sa défaillance.
  if acteur = 'partner' then
    taux := 100;
  else
    taux := app.refund_percent(cmd.cancellation_policy_id, jour, current_date);
  end if;

  select coalesce(sum(p.amount), 0) into regle
  from public.payments p
  where p.order_id = cible and p.status = 'paid';

  -- Ce que le partenaire garde, plafonné à ce qui est entré en caisse : la
  -- plateforme ne réclame pas un complément qu'elle ne saurait pas recouvrer.
  retenu := least(regle, round(cmd.total::numeric * (100 - taux) / 100)::bigint);
  rembourse := regle - retenu;

  if rembourse > 0 then
    insert into public.refunds (
      order_id, client_id, org_id, amount, currency,
      refund_percent, policy_id, reason, requested_by
    )
    values (
      cible, cmd.client_id, cmd.org_id, rembourse, cmd.currency,
      taux, cmd.cancellation_policy_id,
      nullif(btrim(coalesce(motif, '')), ''), auth.uid()
    )
    returning * into r;

    -- Les encaissements se défont du plus récent au plus ancien : on dénoue
    -- dans l'ordre inverse de ce qui a été noué.
    reste := rembourse;

    for pay in
      select * from public.payments
      where order_id = cible and status = 'paid'
      order by created_at desc
    loop
      exit when reste <= 0;

      part := least(reste, pay.amount);
      -- Une part calculée, l'autre en reste — comme `splitPayment`. La reprise
      -- se ventile exactement comme la prise, au franc près.
      com := round(part::numeric * cmd.commission_rate / 100)::bigint;

      insert into public.refund_lines
        (refund_id, payment_id, amount, commission, partner_due, was_paid_out)
      values (r.id, pay.id, part, com, part - com, pay.payout_id is not null);

      if pay.payout_id is not null then
        recuperer := true;
      end if;

      -- Entièrement rendu : l'encaissement n'a plus lieu d'être compté nulle
      -- part. Partiellement rendu, il reste `paid` et porte sa soustraction.
      if part = pay.amount then
        update public.payments
        set status = 'refunded', updated_at = now()
        where id = pay.id;
      end if;

      reste := reste - part;
    end loop;

    if recuperer then
      update public.refunds set needs_recovery = true, updated_at = now() where id = r.id;
    end if;
  end if;

  final := case when rembourse > 0 then 'refunded' else 'cancelled' end;

  update public.orders
  set status = final,
      cancelled_at = now(),
      cancel_reason = nullif(btrim(coalesce(motif, '')), ''),
      cancelled_by = auth.uid(),
      updated_at = now()
  where id = cible;

  -- Les dates retenues repartent au catalogue. Même geste que
  -- `release_stale_orders` : une réservation annulée qui garde son samedi
  -- condamne la date pour tout le monde.
  if cmd.listing_id is not null and cmd.start_date is not null then
    update public.availabilities
    set capacity_used = greatest(0, capacity_used - 1),
        status = case when status = 'booked' then 'open'::public.availability_status
                      else status end,
        updated_at = now()
    where listing_id = cmd.listing_id
      and date between cmd.start_date and coalesce(cmd.end_date, cmd.start_date);
  end if;

  perform app.log_event('order', cible, 'cancel', cmd.status::text, final::text,
    jsonb_build_object('acteur', acteur, 'taux', taux, 'encaisse', regle,
                       'retenu', retenu, 'rembourse', rembourse,
                       'needs_recovery', recuperer));

  sortie := row(cible, final, taux, regle, retenu, rembourse, r.id, recuperer)
    ::public.cancellation_outcome;
  return sortie;
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Enregistrer le remboursement envoyé
--
-- Pendant exact de `mark_payout_sent` (migration 0031), et pour la même raison :
-- tant que le prestataire refuse d'émettre, le virement se fait à la main et se
-- consigne ici. La référence est exigée — sans elle, « remboursé » n'est qu'une
-- affirmation, et un client qui conteste a raison de ne pas s'en contenter.
-- -----------------------------------------------------------------------------
create or replace function public.mark_refund_sent(cible uuid, ref text, commentaire text default null)
returns public.refunds
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.refunds;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(ref, '')) = '' then
    raise exception 'Indiquez la référence de la transaction.' using errcode = 'check_violation';
  end if;

  update public.refunds
  set status = 'sent',
      provider_ref = btrim(ref),
      note = nullif(btrim(coalesce(commentaire, '')), ''),
      sent_at = now(),
      updated_at = now()
  where id = cible and status = 'pending'
  returning * into ligne;

  if ligne.id is null then
    raise exception 'Remboursement introuvable, ou déjà envoyé.' using errcode = 'check_violation';
  end if;

  perform app.log_event('refund', ligne.id, 'send', 'pending', 'sent',
    jsonb_build_object('amount', ligne.amount, 'provider_ref', ligne.provider_ref));

  return ligne;
end;
$$;

revoke execute on function public.mark_refund_sent(uuid, text, text) from public, anon;
grant execute on function public.mark_refund_sent(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Versements — la retenue
--
-- `create_payout` ne rassemblait que « encaissé, pas encore versé ». Il y
-- manquait les deux questions qui coûtent de l'argent : **la date est-elle
-- passée ?** et **cette somme a-t-elle été rendue au client ?**
-- -----------------------------------------------------------------------------
create or replace function public.create_payout(org uuid)
returns public.payouts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  coords public.payout_accounts;
  total bigint;
  ligne public.payouts;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  select * into coords from public.payout_accounts where org_id = org;

  if coords.org_id is null then
    raise exception 'Ce partenaire n''a pas renseigné ses coordonnées de versement.'
      using errcode = 'no_data_found';
  end if;

  select coalesce(sum(p.partner_due - app.refunded_partner_due(p.id)), 0) into total
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.org_id = org
    and p.status = 'paid'
    and p.payout_id is null
    and app.order_payout_ready(o.id);

  if total <= 0 then
    raise exception 'Rien à verser à ce partenaire pour le moment.' using errcode = 'check_violation';
  end if;

  insert into public.payouts (org_id, amount, method, phone, holder_name)
  values (org, total, coords.method, coords.phone, coords.holder_name)
  returning * into ligne;

  -- Rattachement dans la foulée, et **sur exactement le même périmètre** : un
  -- encaissement compté puis non rattaché serait payé deux fois, un encaissement
  -- rattaché sans être compté ne serait jamais payé.
  update public.payments p
  set payout_id = ligne.id, updated_at = now()
  from public.orders o
  where o.id = p.order_id
    and o.org_id = org
    and p.status = 'paid'
    and p.payout_id is null
    and app.order_payout_ready(o.id);

  perform app.log_event('payout', ligne.id, 'create', null, 'pending',
    jsonb_build_object('org_id', org, 'amount', total));

  return ligne;
end;
$$;

revoke execute on function public.create_payout(uuid) from public, anon;
grant execute on function public.create_payout(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Ce qu'on doit, et ce qu'on retient
--
-- Ces deux fonctions remplacent un calcul qui vivait dans `src/lib/payouts.ts`.
-- La règle de retenue est délicate ; en garder **une seule écriture**, celle
-- qui sert aussi à `create_payout`, est la seule façon d'être sûr que l'écran
-- annonce ce que le bouton fera.
--
-- `retenu` n'est pas un détail d'affichage : sans lui, un partenaire voit sa
-- part disparaître de l'écran entre l'encaissement et l'événement, et croit à
-- une erreur.
-- -----------------------------------------------------------------------------
create or replace function public.pending_payout_amount(org uuid)
returns table (payable bigint, held bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(p.partner_due - app.refunded_partner_due(p.id))
             filter (where app.order_payout_ready(o.id)), 0)::bigint,
    coalesce(sum(p.partner_due - app.refunded_partner_due(p.id))
             filter (where not app.order_payout_ready(o.id)), 0)::bigint
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.org_id = org
    and p.status = 'paid'
    and p.payout_id is null
    and (app.is_org_member(org) or app.is_admin());
$$;

revoke execute on function public.pending_payout_amount(uuid) from public, anon;
grant execute on function public.pending_payout_amount(uuid) to authenticated;

create or replace function public.payout_candidates()
returns table (
  org_id uuid,
  org_name text,
  currency text,
  payable bigint,
  held bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.org_id,
    coalesce(g.brand_name, g.legal_name),
    min(p.currency),
    coalesce(sum(p.partner_due - app.refunded_partner_due(p.id))
             filter (where app.order_payout_ready(o.id)), 0)::bigint,
    coalesce(sum(p.partner_due - app.refunded_partner_due(p.id))
             filter (where not app.order_payout_ready(o.id)), 0)::bigint
  from public.payments p
  join public.orders o on o.id = p.order_id
  join public.organizations g on g.id = o.org_id
  where p.status = 'paid'
    and p.payout_id is null
    and app.is_admin()
  group by o.org_id, g.brand_name, g.legal_name
  having coalesce(sum(p.partner_due - app.refunded_partner_due(p.id)), 0) > 0;
$$;

revoke execute on function public.payout_candidates() from public, anon;
grant execute on function public.payout_candidates() to authenticated;

-- -----------------------------------------------------------------------------
-- Naissance d'une commande — désormais avec son barème
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
  select r.id as request_id, r.requester_id as client_id, r.event_date as event_date,
         coalesce(new.listing_id, i.listing_id) as listing_id
  into ctx
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  where i.id = new.item_id;

  taux := app.commission_rate(new.org_id);

  insert into public.orders (
    quote_id, request_id, client_id, org_id, total, currency, commission_rate,
    event_date, cancellation_policy_id
  )
  values (
    new.id, ctx.request_id, ctx.client_id, new.org_id,
    new.subtotal, new.currency, taux, ctx.event_date,
    app.policy_for_listing(ctx.listing_id)
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
-- Réservation immédiate — idem
--
-- Recopie de la migration 0029, à une colonne près : le barème de l'annonce.
-- Le client le lit sur la fiche avant de réserver ; il doit être celui qui
-- s'appliquera, même si le partenaire en change demain.
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

  frais := round(soustotal::numeric * app.service_fee_rate() / 100)::bigint;
  taux := app.commission_rate(fiche.org_id);

  insert into public.orders (
    listing_id, request_id, client_id, org_id,
    total, currency, commission_rate, event_date, start_date, end_date,
    cancellation_policy_id
  )
  values (
    annonce, null, auth.uid(), fiche.org_id,
    soustotal + frais, coalesce(fiche.currency, 'XOF'), taux,
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
                       'soustotal', soustotal, 'frais', frais));

  return nouvelle;
end;
$$;

revoke execute on function public.book_listing(uuid, date[]) from public, anon;
grant execute on function public.book_listing(uuid, date[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Prévenir l'autre partie
--
-- Règle du projet (`CLAUDE.md` §8) : une action qui appelle une réponse
-- déclenche une notification. Une annulation est le cas le plus net — un
-- partenaire qui l'apprend la veille en consultant son planning a déjà refusé
-- d'autres clients pour cette date.
--
-- La mise en file se fait ici, en base, et non dans une Server Action : le
-- client n'a pas le droit de lire le téléphone du partenaire, et le partenaire
-- pas celui du client.
--
-- `release_stale_orders` passe aussi des commandes en `cancelled` ; le
-- déclencheur l'ignore (`cancelled_at` reste nul), un panier abandonné ne
-- méritant pas d'alerter qui que ce soit.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vers_partenaire boolean;
  tel text;
  courriel text;
  nom text;
begin
  if new.cancelled_at is null then
    return new;
  end if;

  -- Celui qui annule connaît déjà la nouvelle : on prévient l'autre.
  vers_partenaire := new.cancelled_by is not distinct from new.client_id;

  if vers_partenaire then
    select o.phone, app.org_email(o.id) into tel, courriel
    from public.organizations o where o.id = new.org_id;
  else
    select p.phone, u.email::text into tel, courriel
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.id = new.client_id;
  end if;

  select coalesce(g.brand_name, g.legal_name) into nom
  from public.organizations g where g.id = new.org_id;

  if tel is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('sms', tel, 'order.cancelled', new.id,
            jsonb_build_object('reference', new.reference, 'partner', nom,
                               'eventDate', new.event_date, 'pour', case when vers_partenaire then 'partner' else 'client' end),
            new.org_id)
    on conflict do nothing;
  end if;

  if courriel is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', courriel, 'order.cancelled', new.id,
            jsonb_build_object('reference', new.reference, 'partner', nom,
                               'eventDate', new.event_date, 'total', new.total,
                               'currency', new.currency,
                               'pour', case when vers_partenaire then 'partner' else 'client' end),
            new.org_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger orders_notify_cancelled
  after update of status on orders
  for each row
  when (new.status in ('cancelled', 'refunded') and old.status not in ('cancelled', 'refunded'))
  execute function app.enqueue_order_cancelled();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Un client voit ses remboursements, un partenaire ceux qui le concernent —
-- ils réduisent sa part, il doit pouvoir en rendre compte. L'écriture passe
-- par les fonctions.
-- -----------------------------------------------------------------------------
alter table refunds enable row level security;
alter table refund_lines enable row level security;

grant select on refunds to authenticated;
grant select on refund_lines to authenticated;

create policy refunds_select on refunds
  for select using (
    client_id = auth.uid() or app.is_org_member(org_id) or app.is_admin()
  );

create policy refund_lines_select on refund_lines
  for select using (
    exists (
      select 1 from public.refunds r
      where r.id = refund_lines.refund_id
        and (r.client_id = auth.uid() or app.is_org_member(r.org_id) or app.is_admin())
    )
  );
