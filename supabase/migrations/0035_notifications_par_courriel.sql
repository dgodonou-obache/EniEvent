-- =============================================================================
-- 0035 — Le SMS est débranché ; tout passe par le courriel.
--
-- Décision de l'exploitant : le SMS coûte trop cher pour ce qu'il apporte. Le
-- constat de terrain lui donne raison — Premux répondait `QUOTA_EXCEEDED` sur
-- **tous** les envois, et personne ne s'en était aperçu : les partenaires ne
-- recevaient plus aucune alerte depuis des semaines pendant que l'e-mail, lui,
-- partait normalement.
--
-- **Rien n'est perdu au passage.** Depuis la migration 0024, les deux canaux
-- partagent une seule charge utile, et c'est l'e-mail qui porte le détail —
-- ville, date, convives, budget, échéance. Le SMS n'en disait qu'un résumé de
-- 160 caractères. On retire donc le canal le plus pauvre et le plus cher.
--
-- **Ce qui change vraiment : la condition pour être prévenu.**
-- `app.request_recipients` admettait un partenaire ayant « un numéro *ou* une
-- adresse ». Sans SMS, un partenaire sans adresse consomme une place du
-- plafond et ne reçoit rien — il faut donc exiger l'adresse. La fonction perd
-- aussi sa colonne `phone`, pour qu'aucune relecture future ne puisse y
-- rebrancher un envoi.
--
-- ⚠️ Cette fonction est **supprimée puis recréée** (le type de retour change),
-- et une fonction recréée **retrouve son `execute` pour `PUBLIC`**. Le `revoke`
-- est donc rejoué juste après — sans quoi les adresses des partenaires mis en
-- concurrence redeviendraient lisibles par n'importe quel compte connecté.
-- C'est la leçon des migrations 0021 et 0024.
--
-- Ce qui est conservé : le type `notification_channel` et sa valeur `sms` (les
-- lignes déjà envoyées y font référence), `src/lib/sms/premux.ts` et
-- `renderSms`. Débrancher n'est pas détruire : remettre le SMS demandera une
-- migration, pas de réécrire le travail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Destinataires d'une demande — désormais ceux qu'on peut écrire
-- -----------------------------------------------------------------------------
drop function if exists app.request_recipients(uuid, int);

create or replace function app.request_recipients(target uuid, cap int)
returns table (org_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct l.org_id, app.org_email(l.org_id)
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  join public.listings l
    on l.status = 'approved'
   and l.is_paused = false
   and (
     i.listing_id = l.id
     or (l.category_id = i.category_id and (l.kind = 'service' or l.city = r.city))
   )
  join public.organizations o on o.id = l.org_id
  where i.request_id = target
    and o.status = 'active'
    -- Sans adresse, un partenaire ne peut plus être prévenu du tout : l'inclure
    -- consommerait une place du plafond pour un envoi qui n'aura pas lieu. Il
    -- retrouve la demande dans `/pro/demandes`.
    and app.org_email(l.org_id) is not null
  order by l.org_id
  limit cap
$$;

comment on function app.request_recipients(uuid, int) is
  'Partenaires à prévenir pour une demande, plafonnés. Miroir de partner_can_see_item.';

-- ⚠️ Obligatoire après un `drop` : la fonction recréée est exécutable par
-- `PUBLIC` par défaut, et elle révèle qui est mis en concurrence.
revoke execute on function app.request_recipients(uuid, int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Publication d'une demande
--
-- Le plafond reste à 20, mais **sa justification change**. Il bornait l'envoi
-- *payant* ; l'e-mail ne coûte rien. Ce qui le justifie désormais, c'est la
-- pertinence — au-delà, on sollicite des prestataires que la demande ne
-- concerne qu'à la marge — et la réputation d'expéditeur, qu'un envoi massif
-- dégrade. Il est remontable sans risque financier, ce qui n'était pas le cas.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap constant int := 20;
  charge jsonb;
begin
  charge := jsonb_build_object(
    'city', new.city,
    'eventDate', new.event_date,
    'reference', new.reference,
    'title', new.title,
    'guests', new.guests,
    'budgetMax', new.budget_max,
    'currency', new.currency,
    'respondBy', new.respond_by
  );

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  select 'email', d.email, 'quote_request.new', new.id, charge, d.org_id
  from app.request_recipients(new.id, cap) d
  where d.email is not null
  on conflict do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Décision transmise au partenaire
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_quote_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible record;
  sujet text;
  charge jsonb;
begin
  select app.org_email(new.org_id) as email,
         r.city as city, r.id as request_id,
         r.reference as reference, r.event_date as event_date,
         r.title as title
  into cible
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  where i.id = new.item_id;

  if cible.email is null then
    return new;
  end if;

  sujet := case when new.status = 'accepted' then 'quote.accepted' else 'quote.declined' end;

  charge := jsonb_build_object(
    'city', cible.city,
    'requestId', cible.request_id,
    'reference', cible.reference,
    'eventDate', cible.event_date,
    'title', cible.title,
    'amount', new.subtotal,
    'currency', new.currency
  );

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values ('email', cible.email, sujet, new.id, charge, new.org_id)
  on conflict do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Le client prévenu qu'un devis l'attend
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_quote_sent_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible record;
  charge jsonb;
begin
  select u.email::text as email, r.city as city, r.id as request_id,
         r.reference as reference,
         coalesce(g.brand_name, g.legal_name) as partenaire
  into cible
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  left join auth.users u on u.id = r.requester_id
  left join public.organizations g on g.id = new.org_id
  where i.id = new.item_id;

  if cible.email is null then
    return new;
  end if;

  charge := jsonb_build_object(
    'city', cible.city,
    'requestId', cible.request_id,
    'reference', cible.reference,
    'partner', cible.partenaire,
    'amount', new.subtotal,
    'currency', new.currency
  );

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values ('email', cible.email, 'quote.sent', new.id, charge, new.org_id)
  on conflict do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Échéance imminente
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_deadline_reminders(fenetre interval default interval '6 hours')
returns int
language plpgsql
set search_path = ''
as $$
declare
  poses int;
begin
  insert into public.notifications (channel, recipient, kind, ref_id, payload)
  select
    'email',
    u.email::text,
    'request.deadline',
    r.id,
    jsonb_build_object(
      'requestId', r.id,
      'city', r.city,
      'reference', r.reference,
      'respondBy', r.respond_by,
      'offres', (
        select count(*)
        from public.quote_request_items i
        join public.quotes q on q.item_id = i.id
        where i.request_id = r.id and q.status = 'sent'
      )
    )
  from public.quote_requests r
  left join auth.users u on u.id = r.requester_id
  where r.status = 'open'
    and r.respond_by is not null
    and r.respond_by between now() and now() + fenetre
    and u.email is not null
    -- Rappeler une échéance sans rien à décider serait une mauvaise nouvelle
    -- doublée d'une injonction.
    and exists (
      select 1
      from public.quote_request_items i
      join public.quotes q on q.item_id = i.id
      where i.request_id = r.id and q.status = 'sent'
    )
  on conflict do nothing;

  get diagnostics poses = row_count;
  return poses;
end;
$$;

comment on function public.enqueue_deadline_reminders(interval) is
  'Rappelle au client qu''une échéance approche, par courriel. Idempotent par '
  'la contrainte d''unicité de notifications.';

revoke execute on function public.enqueue_deadline_reminders(interval) from public, anon, authenticated;
grant execute on function public.enqueue_deadline_reminders(interval) to service_role;

-- -----------------------------------------------------------------------------
-- Annulation d'une réservation
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vers_partenaire boolean;
  courriel text;
  nom text;
begin
  if new.cancelled_at is null then
    return new;
  end if;

  -- Celui qui annule connaît déjà la nouvelle : on prévient l'autre.
  vers_partenaire := new.cancelled_by is not distinct from new.client_id;

  if vers_partenaire then
    courriel := app.org_email(new.org_id);
  else
    select u.email::text into courriel from auth.users u where u.id = new.client_id;
  end if;

  select coalesce(g.brand_name, g.legal_name) into nom
  from public.organizations g where g.id = new.org_id;

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

-- -----------------------------------------------------------------------------
-- La file résiduelle
--
-- Les SMS non partis ne partiront jamais : le drainage ne connaît plus ce
-- canal. Les laisser en `failed` les ferait repasser à chaque exécution de la
-- tâche planifiée, indéfiniment, et masquerait les vrais échecs dans le
-- rapport. Les lignes **déjà envoyées** restent : c'est l'historique.
-- -----------------------------------------------------------------------------
delete from notifications where channel = 'sms' and status <> 'sent';
