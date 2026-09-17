-- =============================================================================
-- 0023 — Les deux notifications qui manquaient au tunnel de devis.
--
-- Le partenaire était prévenu d'une demande, le client d'un devis reçu. Restait
-- le plus important pour chacun : **la décision**.
--
-- 1. Le devis accepté — et refusé. `public.accept_quote` passe les concurrents
--    en `declined` : sans un mot, ces partenaires attendent une réponse qui ne
--    viendra jamais. Prévenir un perdant coûte un SMS et vaut un partenaire qui
--    répondra encore la fois suivante.
--
-- 2. L'échéance qui approche. Un client qui a reçu des offres et laisse expirer
--    sa demande perd son événement ; le partenaire, lui, a travaillé pour rien.
--    C'est le seul rappel qui ne peut pas venir d'un déclencheur : rien ne se
--    passe en base au moment où le temps s'écoule.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Décision transmise au partenaire
--
-- Déclencheur **par ligne** et non par instruction : les concurrents sont
-- refusés en une seule requête, et chacun d'eux doit recevoir son message.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_quote_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible record;
begin
  select o.phone as phone, r.city as city, r.id as request_id
  into cible
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  join public.organizations o on o.id = new.org_id
  where i.id = new.item_id;

  if cible.phone is null then
    return new;
  end if;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values (
    'sms',
    cible.phone,
    case when new.status = 'accepted' then 'quote.accepted' else 'quote.declined' end,
    new.id,
    jsonb_build_object('city', cible.city, 'requestId', cible.request_id),
    new.org_id
  )
  on conflict do nothing;

  return new;
end;
$$;

create trigger quotes_notify_accepted
  after update of status on quotes
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function app.enqueue_quote_decision();

-- Seul un devis réellement en lice mérite un refus : un brouillon retiré par
-- son auteur ne doit déclencher aucun message.
create trigger quotes_notify_declined
  after update of status on quotes
  for each row
  when (new.status = 'declined' and old.status = 'sent')
  execute function app.enqueue_quote_decision();

-- -----------------------------------------------------------------------------
-- Échéance imminente
--
-- Appelée par la tâche planifiée. La contrainte d'unicité
-- `(kind, ref_id, recipient)` fait tout le travail d'idempotence : la fonction
-- peut tourner toutes les quinze minutes sans jamais rappeler deux fois.
--
-- Condition : au moins une offre reçue. Rappeler une échéance sans rien à
-- décider serait une mauvaise nouvelle doublée d'une injonction.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_deadline_reminders(fenetre interval default interval '6 hours')
returns int
language plpgsql
as $$
declare
  poses int;
begin
  insert into public.notifications (channel, recipient, kind, ref_id, payload)
  select
    'sms',
    coalesce(r.contact_phone, p.phone),
    'request.deadline',
    r.id,
    jsonb_build_object(
      'requestId', r.id,
      'city', r.city,
      'offres', (
        select count(*)
        from public.quote_request_items i
        join public.quotes q on q.item_id = i.id
        where i.request_id = r.id and q.status = 'sent'
      )
    )
  from public.quote_requests r
  left join public.profiles p on p.id = r.requester_id
  where r.status = 'open'
    and r.respond_by is not null
    and r.respond_by between now() and now() + fenetre
    and coalesce(r.contact_phone, p.phone) is not null
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
  'Rappelle au client qu''une échéance approche. Idempotent par la contrainte d''unicité de notifications.';

revoke execute on function public.enqueue_deadline_reminders(interval) from public, anon, authenticated;
grant execute on function public.enqueue_deadline_reminders(interval) to service_role;
