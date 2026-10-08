-- =============================================================================
-- 0045 — Plafonner ce qu'un compte peut déclencher
--
-- Audit du 8 octobre 2026. Aucune limitation applicative n'existait nulle part.
--
-- ⚠️ **Ce n'est pas une porte mal fermée, c'est un robinet.** Les autres
-- corrections de cet audit empêchent quelqu'un de lire ce qui ne le regarde
-- pas. Ici, toutes les portes sont bonnes : chaque action est parfaitement
-- légitime prise isolément, et c'est la **répétition** qui fait le dégât.
--
-- Le cas qui compte : déposer une demande de devis déclenche jusqu'à vingt
-- courriels (plafond de `app.request_recipients`). Rien ne limitait le nombre
-- de demandes. Cent demandes automatisées font deux mille envois depuis
-- `enievent.com`.
--
-- **Le dégât n'est pas la facture, c'est la réputation d'expéditeur.** Passé un
-- volume anormal, le domaine bascule en indésirable chez Gmail et Outlook, et
-- il faut des semaines pour en sortir. Les partenaires cessent alors de
-- recevoir les demandes — or ils ne consultent pas `/pro/demandes` d'eux-mêmes
-- (§8 du guide). Le produit s'arrêterait de fonctionner sans qu'une seule
-- erreur n'apparaisse nulle part.
--
-- Mesuré pendant l'audit : déposer une demande exige un compte connecté et
-- confirmé. Ce n'est donc pas ouvert au premier venu — mais une boîte jetable
-- suffit, et le même compte peut ensuite recommencer sans fin.
--
-- Ce que Supabase couvre déjà, et qu'on ne refait pas ici : connexions
-- (30/heure), courriels d'authentification (30/heure), rafraîchissement de
-- jeton (150/heure). Le trou était ailleurs — nos propres actions ne passent
-- pas par GoTrue et n'étaient comptées par personne.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pourquoi des déclencheurs, et pas une vérification en tête de Server Action
--
-- ⚠️ Même leçon que les interrupteurs (§2 du guide) : garder l'entrée de la
-- table couvre **tous** les chemins, y compris ceux qu'on oublie. `messages` a
-- déjà trois portes d'écriture — `send_message`, l'ouverture d'un fil depuis
-- une demande, et la console. Un plafond posé sur deux d'entre elles ne
-- plafonne rien.
--
-- Pourquoi compter les lignes existantes plutôt que tenir un compteur
--
-- Une table de compteurs est un second état à maintenir, donc un état qui
-- finira par diverger de la réalité — et personne ne s'en apercevra, puisqu'un
-- compteur faux ne lève aucune erreur. Les lignes, elles, sont la vérité. Les
-- index ci-dessous rendent le décompte immédiat.
-- -----------------------------------------------------------------------------

create index if not exists quote_requests_debit_idx
  on quote_requests (requester_id, created_at desc);

create index if not exists support_requests_debit_idx
  on support_requests (user_id, created_at desc);

create index if not exists organization_invitations_debit_idx
  on organization_invitations (invited_by, created_at desc);

create index if not exists messages_debit_idx
  on messages (sender_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Qui échappe au plafond
--
-- `auth.uid()` est nul pour la clé de service : tâches planifiées, webhooks,
-- seeds et `demo:reset` passent donc sans compter. C'est voulu — ces chemins
-- sont les nôtres, et un seed bridé par un plafond conçu pour des humains
-- échouerait au milieu sans raison lisible.
--
-- L'administration est exemptée aussi : elle agit pour réparer, souvent en
-- rafale, et c'est précisément le moment où un plafond nuirait.
-- -----------------------------------------------------------------------------
create or replace function app.hors_plafond()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null or app.is_admin();
$$;

comment on function app.hors_plafond() is
  'Vrai pour la clé de service (auth.uid() nul : cron, webhooks, seeds) et '
  'pour l''administration. Migration 0045.';

-- -----------------------------------------------------------------------------
-- Le refus, dit en clair
--
-- ⚠️ Le message est lu par quelqu'un qui n'a peut-être rien fait de mal : un
-- formulaire renvoyé cinq fois parce que la page ramait produit exactement la
-- même trace qu'un abus. Il dit donc **quand revenir**, pas « quota dépassé ».
-- -----------------------------------------------------------------------------
create or replace function app.refuser_debit(quoi text, quand text)
returns void
language plpgsql
immutable
as $$
begin
  raise exception 'Vous avez % en peu de temps. Réessayez %.', quoi, quand
    using errcode = 'check_violation';
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Demandes de devis — 5 par heure, 15 par jour
--
-- Un organisateur sérieux en dépose une ou deux. Le plafond journalier compte
-- autant que l'horaire : sans lui, cinq par heure font cent vingt par jour.
-- -----------------------------------------------------------------------------
create or replace function app.guard_debit_demandes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derniere_heure int;
  dernier_jour int;
begin
  if app.hors_plafond() then return new; end if;

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day')
  into derniere_heure, dernier_jour
  from public.quote_requests
  where requester_id = new.requester_id;

  if derniere_heure >= 5 then
    perform app.refuser_debit('déposé plusieurs demandes', 'dans une heure');
  end if;

  if dernier_jour >= 15 then
    perform app.refuser_debit('déposé beaucoup de demandes aujourd''hui', 'demain');
  end if;

  return new;
end;
$$;

drop trigger if exists quote_requests_debit_guard on quote_requests;
create trigger quote_requests_debit_guard
  before insert on quote_requests
  for each row execute function app.guard_debit_demandes();

-- -----------------------------------------------------------------------------
-- 2. Demandes d'assistance — 5 par heure
--
-- Chacune met un courriel en file (`app.enqueue_support_notification`, 0042).
-- -----------------------------------------------------------------------------
create or replace function app.guard_debit_support()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recentes int;
begin
  if app.hors_plafond() then return new; end if;

  select count(*) into recentes
  from public.support_requests
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recentes >= 5 then
    perform app.refuser_debit('ouvert plusieurs demandes d''assistance', 'dans une heure');
  end if;

  return new;
end;
$$;

drop trigger if exists support_requests_debit_guard on support_requests;
create trigger support_requests_debit_guard
  before insert on support_requests
  for each row execute function app.guard_debit_support();

-- -----------------------------------------------------------------------------
-- 3. Invitations — 20 par jour
--
-- Une équipe se monte en une fois, d'où un plafond large. Mais chaque
-- invitation part par courriel vers une adresse **choisie par l'expéditeur** :
-- sans plafond, le formulaire devient un relais d'envoi vers n'importe qui.
--
-- ⚠️ Le déclencheur couvre aussi l'`update` : `invite_member` réinvite par
-- `on conflict do update`, ce qui renvoie un courriel sans créer de ligne. Un
-- plafond posé sur le seul `insert` se contournerait en réinvitant la même
-- adresse en boucle.
-- -----------------------------------------------------------------------------
create or replace function app.guard_debit_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  envoyees int;
begin
  if app.hors_plafond() or new.invited_by is null then return new; end if;

  select count(*) into envoyees
  from public.organization_invitations
  where invited_by = new.invited_by
    and created_at > now() - interval '1 day';

  if envoyees >= 20 then
    perform app.refuser_debit('envoyé beaucoup d''invitations aujourd''hui', 'demain');
  end if;

  return new;
end;
$$;

drop trigger if exists organization_invitations_debit_guard on organization_invitations;
create trigger organization_invitations_debit_guard
  before insert or update on organization_invitations
  for each row execute function app.guard_debit_invitations();

-- -----------------------------------------------------------------------------
-- 4. Messages — 30 par heure
--
-- Une négociation vive reste très en dessous. Le plafond vise l'automate qui
-- écrit en boucle, et borne surtout le courriel de notification — un par
-- salve, mais une salve par réponse de l'autre partie (§8).
-- -----------------------------------------------------------------------------
create or replace function app.guard_debit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  envoyes int;
begin
  if app.hors_plafond() then return new; end if;

  select count(*) into envoyes
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 hour';

  if envoyes >= 30 then
    perform app.refuser_debit('envoyé beaucoup de messages', 'dans une heure');
  end if;

  return new;
end;
$$;

drop trigger if exists messages_debit_guard on messages;
create trigger messages_debit_guard
  before insert on messages
  for each row execute function app.guard_debit_messages();
