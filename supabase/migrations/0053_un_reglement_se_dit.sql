-- =============================================================================
-- 0053 — Un règlement encaissé se dit, aux deux parties.
--
-- Constaté le 21 octobre 2026, au premier paiement réel abouti
-- (PAY-202610-000158, 500 F sur CMD-202610-000141) : **personne n'a été
-- prévenu**. Ni le client, ni le partenaire. La file de notifications n'a rien
-- reçu, et pour une raison simple — `payments` n'avait aucun déclencheur, et
-- `KINDS` aucun type de paiement. Tout le tunnel du devis notifie
-- (`quote_request.new`, `quote.sent`, `quote.accepted`), l'annulation notifie
-- (`order.cancelled`), et l'événement **le plus important des deux parcours**
-- ne notifiait rien.
--
-- Ce n'est donc pas une panne d'envoi : les courriels partent, la file est
-- verte. C'est un événement qui n'existait pas.
--
-- ⚠️ **Et l'écran de retour le promettait déjà.** « Votre prestataire en est
-- informé. Vous recevrez un récapitulatif par e-mail. » — `/paiement/retour`,
-- mot pour mot, depuis le premier jour. Promettre ce qui n'existe pas est la
-- faute que le `CLAUDE.md` §5 interdit nommément, et elle était ici au pire
-- endroit : juste après que le client a sorti de l'argent.
--
-- Pourquoi un **déclencheur de table** et non un appel dans `settle_payment`
-- (§8) : l'encaissement a déjà deux chemins — le webhook et la tâche de
-- rattrapage — qui passent aujourd'hui par la même fonction, mais rien ne le
-- garantit demain, et une reprise manuelle de l'administration n'en passerait
-- par aucun des deux. Garder l'entrée de la table les couvre tous.
--
-- Un seul événement, deux rédactions. Le `ref_id` est l'identifiant du
-- **paiement**, jamais celui de la commande : avec la commande, l'unicité
-- `(kind, ref_id, recipient)` ne préviendrait que du premier versement, et le
-- solde d'un échéancier partirait en silence.
-- =============================================================================

-- La mise en file, séparée du déclencheur : la réparation des règlements déjà
-- encaissés (plus bas) a besoin de la même logique, et deux copies
-- divergeraient dès la première retouche.
create or replace function app.enqueue_payment_received(reglement public.payments)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd public.orders;
  ech public.order_instalments;
  courriel_client text;
  courriel_partenaire text;
  nom text;
  reste bigint;
  charge jsonb;
begin
  select * into cmd from public.orders where id = reglement.order_id;
  if cmd.id is null then
    return;
  end if;

  select * into ech from public.order_instalments where id = reglement.instalment_id;

  select coalesce(g.brand_name, g.legal_name) into nom
  from public.organizations g where g.id = cmd.org_id;

  -- Ce qui reste dû — la question que les deux parties se posent en lisant le
  -- message. Le déclencheur est `after`, donc la ligne qui vient d'être réglée
  -- est déjà comptée : le reste est juste, sans arithmétique à refaire.
  select coalesce(sum(i.amount), 0) into reste
  from public.order_instalments i
  where i.order_id = cmd.id
    and not exists (
      select 1 from public.payments p
      where p.instalment_id = i.id and p.status = 'paid'
    );

  charge := jsonb_build_object(
    'reference', cmd.reference,
    'paymentReference', reglement.reference,
    'partner', nom,
    'listing', cmd.listing_title,
    'label', coalesce(ech.label, 'Règlement'),
    'amount', reglement.amount,
    'currency', reglement.currency,
    'total', cmd.total,
    'remaining', reste,
    -- Lue par le seul courriel du partenaire. La file est secrète (§8), donc
    -- la part et la commission ne sortent jamais du périmètre voulu.
    'partnerDue', reglement.partner_due,
    'eventDate', cmd.event_date
  );

  select u.email::text into courriel_client
  from auth.users u where u.id = cmd.client_id;

  courriel_partenaire := app.org_email(cmd.org_id);

  if courriel_client is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', courriel_client, 'payment.received', reglement.id,
            charge || jsonb_build_object('pour', 'client'), cmd.org_id)
    on conflict do nothing;
  end if;

  -- ⚠️ Une organisation sans adresse ne doit pas faire échouer l'écriture du
  -- courriel client : les deux insertions sont indépendantes. C'est la même
  -- raison qui a fait exiger une adresse dans `app.request_recipients` (0035) —
  -- sauf qu'ici, rien à plafonner : on ne choisit pas les destinataires d'un
  -- règlement, ce sont les deux parties de la commande.
  if courriel_partenaire is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', courriel_partenaire, 'payment.received', reglement.id,
            charge || jsonb_build_object('pour', 'partner'), cmd.org_id)
    on conflict do nothing;
  end if;
end;
$$;

comment on function app.enqueue_payment_received(public.payments) is
  'Prévient le client et le partenaire qu''une échéance est encaissée. Une ligne de file par partie, ref_id = le paiement.';

revoke execute on function app.enqueue_payment_received(public.payments)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Le déclencheur
-- -----------------------------------------------------------------------------
create or replace function app.payments_notify_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Seul le passage à « encaissé » compte. Un paiement redénoué — le webhook
  -- et la tâche de rattrapage peuvent traiter la même ligne — ne doit pas
  -- reprévenir : l'unicité de `notifications` le couvre aussi, mais autant ne
  -- pas écrire pour rien.
  if new.status <> 'paid' then
    return new;
  end if;

  -- ⚠️ `old` n'est pas assigné sur un INSERT : y toucher lève. D'où le test
  -- imbriqué plutôt qu'un `and`, dont PL/pgSQL ne garantit pas le
  -- court-circuit — l'expression est évaluée comme une requête SQL.
  if tg_op = 'UPDATE' then
    if old.status = 'paid' then
      return new;
    end if;
  end if;

  perform app.enqueue_payment_received(new);
  return new;
end;
$$;

drop trigger if exists payments_notify_received on payments;

create trigger payments_notify_received
  after insert or update on payments
  for each row execute function app.payments_notify_received();

-- -----------------------------------------------------------------------------
-- Les règlements déjà encaissés sans que personne soit prévenu
--
-- Un seul au moment de cette migration — PAY-202610-000158, le premier paiement
-- réel de la plateforme. Le client a sorti de l'argent et n'a rien reçu, alors
-- que l'écran de retour le lui promettait : la réparation n'est pas un confort.
--
-- Bornée à une semaine : une migration rejouée sur une base ancienne ne doit
-- pas réveiller des courriels d'il y a six mois, que plus personne n'attend et
-- qui se liraient comme une anomalie. `on conflict do nothing` fait le reste —
-- un règlement déjà annoncé ne le sera pas deux fois.
-- -----------------------------------------------------------------------------
do $$
declare
  p public.payments;
begin
  for p in
    select * from public.payments
    where status = 'paid'
      and paid_at is not null
      and paid_at > now() - interval '7 days'
      and not exists (
        select 1 from public.notifications n
        where n.kind = 'payment.received' and n.ref_id = payments.id
      )
  loop
    perform app.enqueue_payment_received(p);
  end loop;
end
$$;
