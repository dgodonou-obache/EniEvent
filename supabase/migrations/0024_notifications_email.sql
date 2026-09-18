-- =============================================================================
-- 0024 — Le canal e-mail, enfin alimenté.
--
-- La migration 0018 a créé l'énumération `notification_channel` avec ses deux
-- valeurs, `sms` et `email`. Un an de code plus tard, **aucune ligne n'a jamais
-- été écrite avec `email`** : les trois déclencheurs codent `'sms'` en dur, et
-- la route de drainage porte un `else` qui répond « canal e-mail pas encore
-- branché ». Le canal existait sur le papier, pas dans les faits.
--
-- **Pourquoi doubler, et non remplacer.** Un SMS coûte à chaque envoi et tient
-- en 160 caractères : il alerte, il ne raconte pas. Un e-mail est gratuit et
-- durable : il porte la ville, la date, le nombre de convives, le budget et
-- l'échéance — de quoi décider sans se connecter. Ce sont deux usages, pas
-- deux fois le même. Le plafond de vingt destinataires reste celui du SMS ;
-- c'est lui qui est facturé.
--
-- **Une charge utile pour les deux canaux.** `renderSms` ignore les champs
-- qu'il n'utilise pas. Enrichir la charge sert donc l'e-mail sans rien coûter
-- au SMS, et évite deux jeux de données à maintenir en parallèle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Une adresse mal formée est un envoi perdu
--
-- Pendant exact de `notifications_recipient_e164`. Volontairement permissif :
-- la seule validation qui compte est celle de la boîte réceptrice. On écarte
-- ce qui ne peut pas être une adresse, pas ce qui est exotique.
-- -----------------------------------------------------------------------------
alter table notifications
  add constraint notifications_recipient_email
    check (channel <> 'email' or recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- -----------------------------------------------------------------------------
-- Adresse d'une organisation
--
-- `billing_email` est renseignée à l'inscription (migration 0007) mais reste
-- annulable : une organisation créée à la main, ou vidée depuis l'espace
-- partenaire, n'en aurait plus. Le repli passe par le propriétaire, dont
-- l'adresse est forcément valide puisqu'il s'y est connecté.
-- -----------------------------------------------------------------------------
create or replace function app.org_email(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.billing_email::text from public.organizations o where o.id = org),
    (select u.email::text
       from public.organization_members m
       join auth.users u on u.id = m.user_id
      where m.org_id = org and m.role = 'owner'
      order by m.created_at
      limit 1)
  );
$$;

comment on function app.org_email(uuid) is
  'Adresse de contact d''une organisation : facturation, à défaut le propriétaire.';

revoke execute on function app.org_email(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Destinataires d'une demande — désormais avec l'adresse
--
-- ⚠️ `create or replace` refuse de changer le type de retour : il faut donc
-- supprimer puis recréer. **Et une fonction recréée retrouve son `execute` pour
-- `PUBLIC`** — le `revoke` de la migration 0021 serait silencieusement annulé,
-- rendant à nouveau lisibles les numéros des partenaires mis en concurrence.
-- Le `revoke` est donc rejoué plus bas, et c'est la ligne la plus importante de
-- ce bloc.
-- -----------------------------------------------------------------------------
drop function if exists app.request_recipients(uuid, int);

create function app.request_recipients(target uuid, cap int)
returns table (org_id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct l.org_id, o.phone, app.org_email(l.org_id)
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
    -- Un partenaire sans numéro *ni* adresse ne peut pas être prévenu ; il
    -- retrouve la demande dans `/pro/demandes`. Avoir l'un des deux suffit.
    and (o.phone is not null or app.org_email(l.org_id) is not null)
  order by l.org_id
  limit cap
$$;

comment on function app.request_recipients(uuid, int) is
  'Partenaires à prévenir pour une demande, plafonnés. Miroir de partner_can_see_item.';

-- Rejoué depuis 0021 : voir le commentaire ci-dessus.
revoke execute on function app.request_recipients(uuid, int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Mise en file à la publication — les deux canaux
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Le plafond borne l'envoi *payant*. Il s'applique donc au SMS ; l'e-mail
  -- suit la même liste par cohérence, pour qu'un partenaire prévenu le soit
  -- sur les deux canaux et jamais sur un seul au hasard.
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
  select 'sms', d.phone, 'quote_request.new', new.id, charge, d.org_id
  from app.request_recipients(new.id, cap) d
  where d.phone is not null
  on conflict do nothing;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  select 'email', d.email, 'quote_request.new', new.id, charge, d.org_id
  from app.request_recipients(new.id, cap) d
  where d.email is not null
  on conflict do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Le client prévenu qu'un devis l'attend
--
-- L'adresse du client vient d'`auth.users` : `profiles` n'en porte pas, et il
-- n'y a pas de `contact_email` sur la demande — contrairement au téléphone, où
-- le client peut désigner un proche. L'adresse de connexion est donc la seule,
-- ce qui tombe bien : c'est celle qu'il relève.
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
  select
    coalesce(r.contact_phone, p.phone) as phone,
    u.email::text as email,
    r.id as request_id,
    r.city as city,
    r.reference as reference,
    o.brand_name as partenaire
  into cible
  from public.quote_requests r
  join public.quote_request_items i on i.id = new.item_id
  left join public.profiles p on p.id = r.requester_id
  left join auth.users u on u.id = r.requester_id
  left join public.organizations o on o.id = new.org_id
  where r.id = i.request_id;

  charge := jsonb_build_object(
    'requestId', cible.request_id,
    'city', cible.city,
    'partner', cible.partenaire,
    'reference', cible.reference,
    'amount', new.subtotal,
    'currency', new.currency
  );

  if cible.phone is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('sms', cible.phone, 'quote.sent', new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  if cible.email is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', cible.email, 'quote.sent', new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Décision transmise au partenaire
--
-- Le montant et la date rejoignent la charge : un partenaire qui reçoit
-- « votre devis a été accepté » sans savoir lequel doit se connecter pour une
-- information qu'on pouvait lui donner.
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
  select o.phone as phone, app.org_email(new.org_id) as email,
         r.city as city, r.id as request_id,
         r.reference as reference, r.event_date as event_date
  into cible
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  join public.organizations o on o.id = new.org_id
  where i.id = new.item_id;

  sujet := case when new.status = 'accepted' then 'quote.accepted' else 'quote.declined' end;

  charge := jsonb_build_object(
    'city', cible.city,
    'requestId', cible.request_id,
    'reference', cible.reference,
    'eventDate', cible.event_date,
    'amount', new.subtotal,
    'currency', new.currency
  );

  if cible.phone is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('sms', cible.phone, sujet, new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  if cible.email is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', cible.email, sujet, new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Échéance imminente — les deux canaux
--
-- L'idempotence tient toujours à la contrainte `(kind, ref_id, recipient)` :
-- le numéro et l'adresse étant deux destinataires distincts, les deux lignes
-- cohabitent sans se gêner, et aucune des deux ne part deux fois.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_deadline_reminders(fenetre interval default interval '6 hours')
returns int
language plpgsql
as $$
declare
  poses int;
begin
  with concernees as (
    select
      r.id,
      coalesce(r.contact_phone, p.phone) as phone,
      u.email::text as email,
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
      ) as charge
    from public.quote_requests r
    left join public.profiles p on p.id = r.requester_id
    left join auth.users u on u.id = r.requester_id
    where r.status = 'open'
      and r.respond_by is not null
      and r.respond_by between now() and now() + fenetre
      and exists (
        select 1
        from public.quote_request_items i
        join public.quotes q on q.item_id = i.id
        where i.request_id = r.id and q.status = 'sent'
      )
  ),
  pose as (
    insert into public.notifications (channel, recipient, kind, ref_id, payload)
    select canal.nom, canal.adresse, 'request.deadline', c.id, c.charge
    from concernees c
    cross join lateral (
      values ('sms'::public.notification_channel, c.phone),
             ('email'::public.notification_channel, c.email)
    ) as canal(nom, adresse)
    where canal.adresse is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into poses from pose;

  return poses;
end;
$$;

comment on function public.enqueue_deadline_reminders(interval) is
  'Rappelle au client qu''une échéance approche, par SMS et par e-mail. Idempotent par la contrainte d''unicité de notifications.';

revoke execute on function public.enqueue_deadline_reminders(interval) from public, anon, authenticated;
grant execute on function public.enqueue_deadline_reminders(interval) to service_role;
