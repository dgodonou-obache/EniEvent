-- =============================================================================
-- 0018 — File d'attente des notifications.
--
-- Jusqu'ici, un partenaire ne découvrait une demande de devis qu'en visitant
-- `/pro/demandes`. Le tunnel d'appel d'offres reposait donc sur des partenaires
-- qui pensent à venir regarder — autant dire sur rien.
--
-- **Pourquoi une file, et non un envoi direct depuis la Server Action.**
-- Savoir quels partenaires sont concernés demande de lire les annonces de tout
-- le monde, ce que le client qui dépose le brief n'a pas le droit de faire. La
-- solution paresseuse serait la clé de service dans la Server Action ; le
-- `CLAUDE.md` l'interdit, et à raison. Ici, l'énumération se fait dans un
-- déclencheur `SECURITY DEFINER` qui n'expose rien : il écrit des lignes que le
-- client ne lira jamais.
--
-- **Pourquoi au passage à `open`, et non à la création.** Une demande naît en
-- `draft`, et ses prestations (`quote_request_items`) sont insérées *après*
-- elle : à la création, il n'y a encore rien sur quoi apparier. Surtout, deux
-- chemins mènent à la publication — direct, ou après validation d'entreprise
-- (`decide_approval`). S'accrocher à la transition les couvre tous les deux ;
-- s'accrocher à la Server Action en raterait un.
--
-- **Confidentialité.** La file dit qui a été prévenu d'une demande, donc qui
-- sont les concurrents en lice. C'est exactement ce que le principe du pli
-- cacheté interdit de révéler : seule l'administration peut la lire.
-- =============================================================================

-- `sending` dès la création du type : ajouter une valeur à une énumération et
-- s'en servir dans la même transaction échoue (leçon de la migration 0013).
create type notification_channel as enum ('sms', 'email');
create type notification_status as enum ('pending', 'sending', 'sent', 'failed');

create table notifications (
  id uuid primary key default gen_random_uuid(),
  channel notification_channel not null,
  -- Numéro E.164 ou adresse e-mail selon le canal.
  recipient text not null,
  -- Ce qui s'est passé, pas le texte : la rédaction vit dans
  -- `src/lib/notify/messages.ts`, où elle est testable et où la remise en
  -- alphabet GSM s'applique. Stocker le texte figerait la formulation du jour.
  kind text not null,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  target_org_id uuid references organizations(id) on delete set null,
  status notification_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,

  -- Un numéro mal formé est facturé par la passerelle avant d'être rejeté.
  constraint notifications_recipient_e164
    check (channel <> 'sms' or recipient ~ '^\+[1-9][0-9]{7,14}$'),

  -- Idempotence : un partenaire n'est prévenu qu'une fois par demande, même si
  -- celle-ci est refermée puis rouverte. En SQL, deux `null` ne s'égalent pas :
  -- les notifications sans référence ne se gênent donc jamais entre elles.
  unique (kind, ref_id, recipient)
);

-- Le drainage ne lit que ce qui reste à faire : un index partiel suffit et
-- reste petit même quand la table grossit.
create index notifications_a_traiter
  on notifications (created_at)
  where status in ('pending', 'failed');

-- -----------------------------------------------------------------------------
-- Destinataires d'une demande
--
-- Miroir de `app.partner_can_see_item` : un partenaire est concerné s'il a une
-- annonce approuvée, non suspendue, qui est soit celle visée, soit de la même
-- catégorie — et dans la même ville lorsqu'il s'agit d'un lieu, un lieu ne se
-- déplaçant pas.
--
-- Le plafond n'est pas une prudence de façade. Un brief « traiteur à Cotonou »
-- concerne *tous* les traiteurs approuvés de Cotonou ; à deux cents, c'est deux
-- cents SMS facturés pour une seule demande. Au-delà du plafond, la demande
-- reste visible dans `/pro/demandes` : personne n'est exclu, seule l'alerte
-- payante est bornée.
-- -----------------------------------------------------------------------------
create or replace function app.request_recipients(target uuid, cap int)
returns table (org_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct l.org_id, o.phone
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
    and o.phone is not null
  order by l.org_id
  limit cap
$$;

comment on function app.request_recipients(uuid, int) is
  'Partenaires à prévenir pour une demande, plafonnés. Miroir de partner_can_see_item.';

-- -----------------------------------------------------------------------------
-- Mise en file à la publication
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Vingt suffit à amorcer la concurrence sans transformer chaque brief en
  -- campagne d'envoi. À ajuster quand le catalogue aura grossi.
  cap constant int := 20;
begin
  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  select
    'sms',
    d.phone,
    'quote_request.new',
    new.id,
    jsonb_build_object(
      'city', new.city,
      'eventDate', new.event_date,
      'reference', new.reference
    ),
    d.org_id
  from app.request_recipients(new.id, cap) d
  on conflict do nothing;

  return new;
end;
$$;

create trigger quote_requests_notify
  after update of status on quote_requests
  for each row
  when (new.status = 'open' and old.status is distinct from 'open')
  execute function app.enqueue_request_notifications();

-- -----------------------------------------------------------------------------
-- Le client prévenu qu'un devis l'attend
--
-- Symétrique du précédent : sans lui, un client qui a lancé un appel d'offres
-- doit revenir voir de lui-même si quelqu'un a répondu. Le devis reste scellé
-- jusqu'à son envoi — c'est donc la transition vers `sent` qui compte, jamais
-- l'enregistrement d'un brouillon.
--
-- Le numéro de contact saisi dans le brief prime sur celui du profil : c'est
-- celui que le client a donné *pour cet événement*, parfois celui d'un proche
-- qui suit l'organisation.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_quote_sent_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible record;
begin
  select
    coalesce(r.contact_phone, p.phone) as phone,
    r.id as request_id,
    r.city as city,
    o.brand_name as partenaire
  into cible
  from public.quote_requests r
  join public.quote_request_items i on i.id = new.item_id
  left join public.profiles p on p.id = r.requester_id
  left join public.organizations o on o.id = new.org_id
  where r.id = i.request_id;

  if cible.phone is null then
    -- Pas de numéro : rien à mettre en file. Le devis reste visible dans
    -- l'espace du client, la notification n'est qu'un rappel.
    return new;
  end if;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values (
    'sms',
    cible.phone,
    'quote.sent',
    new.id,
    jsonb_build_object(
      'requestId', cible.request_id,
      'city', cible.city,
      'partner', cible.partenaire
    ),
    new.org_id
  )
  on conflict do nothing;

  return new;
end;
$$;

create trigger quotes_notify_sent
  after update of status on quotes
  for each row
  when (new.status = 'sent' and old.status is distinct from 'sent')
  execute function app.enqueue_quote_sent_notification();

-- -----------------------------------------------------------------------------
-- Drainage
--
-- `for update skip locked` réserve les lignes : deux exécutions de la tâche
-- planifiée qui se chevauchent ne peuvent pas envoyer deux fois le même SMS.
-- C'est ce qui justifie l'état `sending`, qui n'existe que le temps de l'appel.
--
-- Les échecs sont rejoués jusqu'à trois tentatives : une passerelle
-- momentanément injoignable ne doit pas faire perdre l'alerte.
--
-- Ces deux fonctions ne sont **pas** `security definer` : la tâche planifiée
-- passe par la clé de service, qui contourne déjà la RLS. Les droits sont
-- retirés à tout le monde d'autre — sans quoi n'importe quel utilisateur
-- connecté pourrait marquer comme envoyées des notifications jamais parties.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(batch int default 25)
returns setof public.notifications
language sql
as $$
  update public.notifications n
  set status = 'sending', attempts = n.attempts + 1
  where n.id in (
    select c.id
    from public.notifications c
    where c.status = 'pending'
       or (c.status = 'failed' and c.attempts < 3)
    order by c.created_at
    limit batch
    for update skip locked
  )
  returning n.*;
$$;

create or replace function public.mark_notification(target uuid, delivered boolean, detail text default null)
returns void
language sql
as $$
  update public.notifications
  set status = case when delivered then 'sent'::public.notification_status
                    else 'failed'::public.notification_status end,
      sent_at = case when delivered then now() else sent_at end,
      last_error = detail
  where id = target;
$$;

revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.mark_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.mark_notification(uuid, boolean, text) to service_role;

-- La RLS filtre, elle ne donne pas le droit d'entrer : sans ce `grant`, même
-- l'administration se verrait opposer « permission denied for table ».
grant select on notifications to authenticated;

-- -----------------------------------------------------------------------------
-- RLS — lecture réservée à l'administration
--
-- Aucune politique d'écriture : les lignes naissent dans un déclencheur
-- `SECURITY DEFINER` et ne sont modifiées que par la clé de service. Un
-- partenaire qui pourrait lire cette table saurait combien de concurrents ont
-- été prévenus, et lesquels.
-- -----------------------------------------------------------------------------
alter table notifications enable row level security;

create policy notifications_select on notifications
  for select using (app.is_admin());
