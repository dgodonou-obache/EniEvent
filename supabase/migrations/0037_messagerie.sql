-- =============================================================================
-- 0037 — Messagerie client ↔ prestataire.
--
-- Jusqu'ici, un seul échange existait, unidirectionnel et à un coup :
-- `quotes.message` du prestataire vers le client, et `quotes.decline_reason`
-- en retour au moment d'écarter. Un partenaire à qui manque une information —
-- le nombre exact de couverts, l'accès au lieu, l'heure de montage — n'avait
-- **aucun moyen de la demander**. Il ouvrait un brouillon de devis, ou
-- chiffrait de travers.
--
-- **Ce n'est pas une fonctionnalité de discussion.** Le seul revenu d'ÉniEvent
-- est la commission du partenaire : si les deux parties s'échangent leurs
-- numéros avant de réserver, la vente se fait ailleurs et la commission
-- s'applique à rien. Toute la conception découle de là.
--
-- ## Un fil par couple (client, prestataire)
--
-- Jamais un fil libre. Le pli cacheté de l'appel d'offres tient alors **par
-- construction** : un fil n'existe qu'entre deux parties, donc aucun partenaire
-- ne peut lire celui d'un concurrent. Il n'y a rien à rejouer de
-- `app.can_view_quote` — c'est la forme du modèle qui protège.
--
-- Le côté client copie `quote_requests` (`client_id` + `client_org_id`,
-- migration 0009) : sans quoi le collègue d'une entreprise ne verrait pas le
-- fil ouvert par son collègue, alors que budgets et validations sont déjà des
-- fonctions d'équipe dans cet espace.
--
-- ## Deux seuils, et surtout pas un seul
--
-- - **Une commande existe** → le prestataire voit enfin le **nom** du client.
--   Il doit savoir qui il sert pour organiser la prestation.
-- - **Un encaissement est constaté** → les **coordonnées** cessent d'être
--   masquées. La commission est acquise ; les deux ont besoin de se coordonner.
--
-- Les confondre serait une faute : un prestataire qui monte un chapiteau a
-- besoin d'un nom bien avant d'avoir le droit d'appeler.
--
-- ## Ce que le masquage est, et ce qu'il n'est pas
--
-- Un **ralentisseur**, pas un mur. « zéro un quatre-vingt-dix-sept » passera
-- toujours. Il rend le contournement volontaire et visible, ce qui suffit à
-- décourager l'usage par simple commodité — et c'est tout ce qu'on lui demande.
-- Ne jamais s'y fier comme à une serrure.
-- =============================================================================

create type message_side as enum ('client', 'partner');

-- -----------------------------------------------------------------------------
-- Masquage des coordonnées
--
-- `immutable` : aucune lecture de table, uniquement du texte. C'est ce qui
-- permet de l'appeler des milliers de fois dans une lecture de fil sans coût.
--
-- Les formats visés sont ceux du Bénin depuis le 30 novembre 2024 : dix
-- chiffres préfixés `01`, ou l'indicatif `+229`. Les séparateurs usuels —
-- espace, point, tiret — sont tolérés au milieu, parce que c'est ainsi qu'on
-- écrit un numéro à la main.
--
-- ⚠️ Ce qu'il ne doit **pas** masquer compte autant : un prix (« 150 000 »),
-- une date, une référence de commande (« CMD-202609-000062 »). D'où la borne
-- de mot `\m` et l'exigence d'un premier chiffre nul — un montant ne commence
-- pas par zéro, un numéro béninois toujours.
-- -----------------------------------------------------------------------------
create or replace function app.mask_contacts(texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(texte, ''),
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
        '[adresse masquée]',
        'g'
      ),
      -- Indicatif international, suivi de 8 à 10 chiffres.
      '(\+|00)[[:space:].-]*229([[:space:].-]*[0-9]){8,10}',
      '[numéro masqué]',
      'g'
    ),
    -- Format national à dix chiffres.
    '\m0[1-9]([[:space:].-]*[0-9]){8}\M',
    '[numéro masqué]',
    'g'
  );
$$;

comment on function app.mask_contacts(text) is
  'Masque numéros béninois et adresses électroniques. Ralentisseur, pas serrure.';

-- -----------------------------------------------------------------------------
-- Où en est la relation entre ce client et ce prestataire
-- -----------------------------------------------------------------------------
create or replace function app.engagement_level(client uuid, org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.orders o
      join public.payments p on p.order_id = o.id and p.status = 'paid'
      where o.client_id = client and o.org_id = org
    ) then 'encaisse'
    when exists (
      select 1
      from public.orders o
      where o.client_id = client and o.org_id = org
        and o.status <> 'cancelled'
    ) then 'commande'
    else 'aucun'
  end;
$$;

revoke execute on function app.engagement_level(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Les fils
-- -----------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_reference('MSG'),

  client_id uuid not null references profiles (id) on delete cascade,
  -- Renseigné quand le client agit pour une entreprise : ses collègues
  -- partagent alors le fil. Même motif que `quote_requests.org_id`.
  client_org_id uuid references organizations (id) on delete set null,

  org_id uuid not null references organizations (id) on delete cascade,

  -- Contexte d'ouverture, pour l'affichage seulement. **Jamais** pour
  -- l'autorisation : celle-ci se lit sur `client_id`, `client_org_id`, `org_id`.
  listing_id uuid references listings (id) on delete set null,
  request_id uuid references quote_requests (id) on delete set null,

  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un seul fil par couple : c'est ce qui garde l'historique d'un bout à
  -- l'autre de la relation, du premier renseignement à la dernière prestation.
  unique (client_id, org_id)
);

create index conversations_client on conversations (client_id, last_message_at desc);
create index conversations_org on conversations (org_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete restrict,
  -- Figé à l'écriture : un membre peut quitter son organisation, le message
  -- reste celui du prestataire.
  sender_side message_side not null,

  body text not null check (length(btrim(body)) between 1 and 4000),

  created_at timestamptz not null default now()
);

create index messages_conversation on messages (conversation_id, created_at);

create table conversation_reads (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Ouvrir un fil
-- -----------------------------------------------------------------------------
create or replace function public.open_conversation(
  org uuid,
  annonce uuid default null,
  demande uuid default null
)
returns public.conversations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  entreprise uuid;
  ligne public.conversations;
begin
  if moi is null then
    raise exception 'Connectez-vous pour écrire à un prestataire.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.organizations o where o.id = org and o.type = 'partner') then
    raise exception 'Prestataire introuvable.' using errcode = 'no_data_found';
  end if;

  -- Un membre du prestataire ne s'écrit pas à lui-même.
  if app.is_org_member(org) then
    raise exception 'Vous ne pouvez pas ouvrir une conversation avec votre propre organisation.'
      using errcode = 'check_violation';
  end if;

  if annonce is not null and not exists (
    select 1 from public.listings l
    where l.id = annonce and l.org_id = org and l.status = 'approved' and l.is_paused = false
  ) then
    raise exception 'Cette annonce n''est pas disponible.' using errcode = 'check_violation';
  end if;

  -- L'entreprise du client, s'il agit pour l'une d'elles sur cette demande.
  select r.org_id into entreprise
  from public.quote_requests r
  where r.id = demande and r.requester_id = moi;

  insert into public.conversations (client_id, client_org_id, org_id, listing_id, request_id)
  values (moi, entreprise, org, annonce, demande)
  on conflict (client_id, org_id) do update
    -- Le contexte le plus récent l'emporte, sans jamais effacer un contexte
    -- existant par un appel qui n'en porte pas.
    set listing_id = coalesce(excluded.listing_id, public.conversations.listing_id),
        request_id = coalesce(excluded.request_id, public.conversations.request_id),
        updated_at = now()
  returning * into ligne;

  return ligne;
end;
$$;

revoke execute on function public.open_conversation(uuid, uuid, uuid) from public, anon;
grant execute on function public.open_conversation(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Ouvrir un fil depuis une demande, côté prestataire
--
-- C'est le point de plus forte valeur métier : un partenaire qui ne peut pas
-- lever une ambiguïté chiffre de travers, ou renonce. Il ne choisit pas son
-- interlocuteur — il désigne une demande, et la base en déduit le client.
-- L'anonymat tient : rien ici ne lui rend l'identité.
-- -----------------------------------------------------------------------------
create or replace function public.open_conversation_for_request(demande uuid, mon_org uuid)
returns public.conversations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ctx record;
  ligne public.conversations;
begin
  if not app.is_org_member(mon_org) then
    raise exception 'Vous n''appartenez pas à cette organisation.'
      using errcode = 'insufficient_privilege';
  end if;

  if not app.partner_can_see_request(demande) then
    raise exception 'Cette demande ne vous est pas ouverte.' using errcode = 'insufficient_privilege';
  end if;

  select r.requester_id as client, r.org_id as entreprise
  into ctx
  from public.quote_requests r
  where r.id = demande;

  insert into public.conversations (client_id, client_org_id, org_id, request_id)
  values (ctx.client, ctx.entreprise, mon_org, demande)
  on conflict (client_id, org_id) do update
    set request_id = coalesce(public.conversations.request_id, excluded.request_id),
        updated_at = now()
  returning * into ligne;

  return ligne;
end;
$$;

revoke execute on function public.open_conversation_for_request(uuid, uuid) from public, anon;
grant execute on function public.open_conversation_for_request(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Écrire
--
-- **La notification est groupée par salve.** On ne prévient que si le message
-- précédent venait de l'autre partie : dix messages d'affilée font un seul
-- courriel, et la réponse d'en face rouvre le droit d'alerter. La règle est
-- sans état, donc sans dérive possible.
--
-- ⚠️ **Le corps du message n'entre pas dans la charge utile.** Y mettre un
-- extrait contournerait tout le masquage : il suffirait d'écrire son numéro
-- pour qu'il parte en clair dans une boîte de réception. C'est la première
-- charge utile du dépôt qui ne transporte aucun texte libre, et c'est un choix.
-- -----------------------------------------------------------------------------
create or replace function public.send_message(conversation uuid, corps text)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  fil public.conversations;
  cote public.message_side;
  precedent public.message_side;
  ligne public.messages;
  destinataire text;
  expediteur text;
begin
  select * into fil from public.conversations where id = conversation;

  if fil.id is null then
    raise exception 'Conversation introuvable.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if fil.client_id = moi
     or (fil.client_org_id is not null and app.is_org_member(fil.client_org_id)) then
    cote := 'client';
  elsif app.is_org_member(fil.org_id) then
    cote := 'partner';
  else
    raise exception 'Cette conversation ne vous est pas ouverte.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(corps, ''))) = 0 then
    raise exception 'Un message ne peut pas être vide.' using errcode = 'check_violation';
  end if;

  insert into public.messages (conversation_id, sender_id, sender_side, body)
  values (conversation, moi, cote, btrim(corps))
  returning * into ligne;

  update public.conversations
  set last_message_at = ligne.created_at, updated_at = now()
  where id = conversation;

  -- L'expéditeur a forcément lu ce qu'il vient d'écrire.
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (conversation, moi, ligne.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  -- Le message d'avant : s'il venait déjà de nous, l'autre a été prévenu.
  select m.sender_side into precedent
  from public.messages m
  where m.conversation_id = conversation and m.id <> ligne.id
  order by m.created_at desc
  limit 1;

  if precedent is null or precedent <> cote then
    if cote = 'client' then
      destinataire := app.org_email(fil.org_id);
      select coalesce(p.full_name, 'Un client') into expediteur
      from public.profiles p where p.id = fil.client_id;

      -- Tant que rien n'engage les deux parties, le prestataire ne doit pas
      -- apprendre par courriel un nom que l'écran lui cache.
      if app.engagement_level(fil.client_id, fil.org_id) = 'aucun' then
        expediteur := 'Un client';
      end if;
    else
      select u.email::text into destinataire
      from auth.users u where u.id = fil.client_id;
      select coalesce(g.brand_name, g.legal_name) into expediteur
      from public.organizations g where g.id = fil.org_id;
    end if;

    if destinataire is not null then
      insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
      values ('email', destinataire, 'message.new', ligne.id,
              jsonb_build_object(
                'conversationId', conversation,
                'reference', fil.reference,
                'sender', expediteur,
                'pour', case when cote = 'client' then 'partner' else 'client' end
              ),
              fil.org_id)
      on conflict do nothing;
    end if;
  end if;

  perform app.log_event('message', ligne.id, 'send', null, null,
    jsonb_build_object('conversation_id', conversation, 'side', cote));

  return ligne;
end;
$$;

revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Lire un fil
--
-- ⚠️ **Le corps brut ne sort jamais de la base.** `messages` n'est pas lisible
-- par `authenticated` : un simple appel PostgREST contournerait sinon le
-- masquage en une requête. Tout passe par ici, où le texte est masqué selon le
-- lecteur et le seuil atteint.
-- -----------------------------------------------------------------------------
create or replace function public.read_conversation(conversation uuid)
returns table (
  id uuid,
  sender_side public.message_side,
  mine boolean,
  body text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  fil public.conversations;
  cote public.message_side;
  masquer boolean;
begin
  -- ⚠️ Alias obligatoire : la fonction déclare une colonne de sortie nommée
  -- `id`, et un `where id = …` non qualifié est refusé comme ambigu.
  select c.* into fil from public.conversations c where c.id = conversation;

  if fil.id is null then
    raise exception 'Conversation introuvable.' using errcode = 'no_data_found';
  end if;

  if fil.client_id = moi
     or (fil.client_org_id is not null and app.is_org_member(fil.client_org_id)) then
    cote := 'client';
  elsif app.is_org_member(fil.org_id) then
    cote := 'partner';
  elsif app.is_admin() then
    -- L'administration lit pour arbitrer un litige : elle voit le texte brut.
    cote := null;
  else
    raise exception 'Cette conversation ne vous est pas ouverte.'
      using errcode = 'insufficient_privilege';
  end if;

  masquer := cote is not null
    and app.engagement_level(fil.client_id, fil.org_id) <> 'encaisse';

  if cote is not null then
    insert into public.conversation_reads (conversation_id, user_id, last_read_at)
    values (conversation, moi, now())
    on conflict (conversation_id, user_id) do update set last_read_at = now();
  end if;

  return query
    select m.id,
           m.sender_side,
           m.sender_side = cote,
           case when masquer then app.mask_contacts(m.body) else m.body end,
           m.created_at
    from public.messages m
    where m.conversation_id = conversation
    order by m.created_at;
end;
$$;

revoke execute on function public.read_conversation(uuid) from public, anon;
grant execute on function public.read_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Mes conversations
--
-- L'interlocuteur est nommé selon le seuil : le client voit toujours l'enseigne
-- du prestataire — elle est publique sur l'annonce — mais le prestataire ne lit
-- « Le client » que jusqu'à ce qu'une commande existe.
-- -----------------------------------------------------------------------------
-- `drop` explicite : le type de retour a changé en cours de route, et
-- `create or replace` refuse. La fonction recréée retrouvant son `execute` pour
-- `PUBLIC`, le `revoke` qui suit n'est pas optionnel.
drop function if exists public.my_conversations();

create or replace function public.my_conversations()
returns table (
  id uuid,
  reference text,
  side public.message_side,
  counterpart text,
  listing_id uuid,
  listing_title text,
  request_id uuid,
  request_reference text,
  last_message_at timestamptz,
  unread int,
  -- Vrai une fois un règlement encaissé : l'écran cesse alors d'annoncer un
  -- masquage qui ne s'applique plus.
  unmasked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.reference,
    (case when c.client_id = auth.uid()
            or (c.client_org_id is not null and app.is_org_member(c.client_org_id))
          then 'client' else 'partner' end)::public.message_side,
    case
      when c.client_id = auth.uid()
        or (c.client_org_id is not null and app.is_org_member(c.client_org_id))
      then coalesce(g.brand_name, g.legal_name)
      when app.engagement_level(c.client_id, c.org_id) = 'aucun' then 'Le client'
      else coalesce(p.full_name, 'Le client')
    end,
    c.listing_id,
    l.title,
    c.request_id,
    r.reference,
    c.last_message_at,
    (
      select count(*)::int
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select cr.last_read_at from public.conversation_reads cr
            where cr.conversation_id = c.id and cr.user_id = auth.uid()),
          '-infinity'::timestamptz
        )
    ),
    app.engagement_level(c.client_id, c.org_id) = 'encaisse'
  from public.conversations c
  join public.organizations g on g.id = c.org_id
  left join public.profiles p on p.id = c.client_id
  left join public.listings l on l.id = c.listing_id
  left join public.quote_requests r on r.id = c.request_id
  where c.client_id = auth.uid()
     or (c.client_org_id is not null and app.is_org_member(c.client_org_id))
     or app.is_org_member(c.org_id)
  order by c.last_message_at desc nulls last;
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
--
-- ⚠️ L'appartenance s'écrit **en clair sur les colonnes de la ligne**, jamais
-- par une fonction qui relirait `conversations` : une politique `SELECT`
-- s'applique aussi au `RETURNING` d'un `INSERT`, et une fonction `stable` ne
-- voit pas la ligne en cours d'écriture. L'auteur ne pourrait pas relire ce
-- qu'il vient d'ouvrir (leçon de la migration 0009).
--
-- `messages` n'est lisible que par l'administration : le corps brut ne doit
-- sortir que par `read_conversation`, qui masque. Une politique est malgré tout
-- obligatoire — `db:verify` refuse une table sans.
-- -----------------------------------------------------------------------------
alter table conversations enable row level security;
alter table messages enable row level security;
alter table conversation_reads enable row level security;

grant select on conversations to authenticated;
grant select on conversation_reads to authenticated;
-- Aucun `grant` sur `messages` : lecture par fonction uniquement.

create policy conversations_select on conversations
  for select using (
    client_id = auth.uid()
    or (client_org_id is not null and client_org_id in (select app.user_org_ids()))
    or org_id in (select app.user_org_ids())
    or app.is_admin()
  );

create policy messages_select on messages
  for select using (app.is_admin());

create policy conversation_reads_select on conversation_reads
  for select using (user_id = auth.uid() or app.is_admin());
