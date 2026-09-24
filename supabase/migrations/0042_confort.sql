-- =============================================================================
-- 0042 — Lot D, première tranche : favoris, support, invitations
--
-- Trois manques qui n'ont rien en commun, sinon de ne toucher **aucun
-- montant**. Les deux chantiers du lot D qui touchent le prix payé — les
-- promotions et les créneaux — ne sont pas ici : ils demandent `money.ts`,
-- `allocate()` et leurs tests, et se livreront séparément.
--
-- ⚠️ **Deux de ces trois envoient du courriel, et aucun ne l'envoie
-- lui-même.** `sendEmail` n'est appelé que depuis `/api/cron/notifications`
-- (§8 du guide) : la mise en file se fait en base, par déclencheur, au passage
-- à l'état utile. Une Server Action qui enverrait directement contournerait la
-- cadence de Resend (2 requêtes par seconde), perdrait le message en cas
-- d'échec, et n'en garderait aucune trace.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Favoris
--
-- ⚠️ **Un favori est privé, et le compte des favoris ne s'affiche nulle part.**
-- « 42 personnes ont mis cette salle en favori » serait de la preuve sociale
-- fabriquée à peu de frais : le chiffre dépend de qui passe, pas de ce que vaut
-- la prestation, et rien n'empêche un partenaire de le gonfler. Le guide §5
-- l'interdit, et la RLS ci-dessous rend l'agrégat impossible à lire de toute
-- façon — ce qui vaut mieux qu'une règle qu'on se rappelle.
-- -----------------------------------------------------------------------------

create table if not exists favorites (
  user_id uuid not null references profiles (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, listing_id)
);

comment on table favorites is
  'Favoris d''un client. Strictement privés : aucun agrégat public, '
  'sous peine de fabriquer de la preuve sociale (guide §5).';

create index if not exists favorites_user_idx on favorites (user_id, created_at desc);

alter table favorites enable row level security;

-- Chacun les siens. Pas d'exception pour l'administration : savoir ce qu'un
-- client a mis de côté n'aide à rien et se lit comme de la surveillance.
drop policy if exists favorites_own on favorites;
create policy favorites_own on favorites
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on favorites to authenticated;
revoke all on favorites from anon;

-- -----------------------------------------------------------------------------
-- Demandes de support
--
-- Une table plutôt qu'un envoi direct : on garde la trace de ce qui a été
-- demandé, et le message part par la file comme tout le reste.
-- -----------------------------------------------------------------------------

insert into app.runtime_config (key, value)
values ('support_email', 'contact@enievent.com')
on conflict (key) do nothing;

create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  -- L'organisation au nom de laquelle on écrit, s'il y en a une. Sans elle, on
  -- ne saurait pas de quel partenaire vient la question.
  org_id uuid references organizations (id) on delete set null,
  subject text not null check (length(btrim(subject)) between 3 and 150),
  body text not null check (length(btrim(body)) between 20 and 4000),
  -- Où répondre. Recopiée à l'écriture : l'adresse du compte peut changer, la
  -- conversation doit rester joignable là où elle a commencé.
  reply_to text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

comment on table support_requests is
  'Messages envoyés au support. La réponse se fait par courriel, hors plateforme : '
  'ce n''est pas une messagerie, et l''écran le dit.';

create index if not exists support_requests_open_idx on support_requests (created_at desc)
  where status = 'open';

alter table support_requests enable row level security;

-- L'auteur relit les siennes ; l'administration les lit toutes.
drop policy if exists support_requests_select on support_requests;
create policy support_requests_select on support_requests
  for select using (user_id = auth.uid() or app.is_admin());

drop policy if exists support_requests_insert on support_requests;
create policy support_requests_insert on support_requests
  for insert with check (user_id = auth.uid());

-- Refermer une demande est une décision de l'équipe, pas de celui qui l'ouvre.
drop policy if exists support_requests_close on support_requests;
create policy support_requests_close on support_requests
  for update using (app.is_admin()) with check (app.is_admin());

grant select, insert on support_requests to authenticated;
grant update (status) on support_requests to authenticated;
revoke all on support_requests from anon;

/**
 * Le support prévenu, par la file.
 *
 * ⚠️ Le corps du message **voyage ici**, contrairement à `message.new`. La
 * différence n'est pas une inconséquence : le masquage des coordonnées protège
 * un client d'un prestataire, et réciproquement. Une demande de support est
 * adressée à l'équipe, qui a par ailleurs accès à la table — cacher le texte
 * dans le courriel obligerait à ouvrir le back-office pour lire une question,
 * sans rien protéger de plus.
 */
create or replace function app.enqueue_support_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinataire text;
begin
  select c.value into destinataire from app.runtime_config c where c.key = 'support_email';

  if destinataire is null or btrim(destinataire) = '' then
    -- Pas d'adresse, pas d'envoi — mais la demande est écrite, donc rien n'est
    -- perdu : elle apparaîtra dans le back-office.
    return new;
  end if;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values (
    'email',
    destinataire,
    'support.new',
    new.id,
    jsonb_build_object(
      'subject', new.subject,
      'body', new.body,
      'replyTo', new.reply_to
    ),
    new.org_id
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists support_requests_notify on support_requests;
create trigger support_requests_notify
  after insert on support_requests
  for each row execute function app.enqueue_support_notification();

-- -----------------------------------------------------------------------------
-- Invitations dans une organisation
--
-- ⚠️ **Pourquoi une table neuve plutôt que `organization_members`.**
-- Cette dernière a bien un statut `invited`, mais son `user_id` référence
-- `profiles (id)` : on ne peut y inscrire quelqu'un qu'**une fois son compte
-- créé**. Or inviter un collègue, c'est justement s'adresser à quelqu'un qui
-- n'en a pas encore. Le lot C avait buté là-dessus et reporté la
-- fonctionnalité plutôt que de l'ajouter à moitié.
-- -----------------------------------------------------------------------------

create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  -- `citext` : personne ne retape son adresse avec la même casse.
  email citext not null,
  role org_role not null,
  -- ⚠️ Le jeton **est** le secret. Il ne sort d'ici que dans le courriel :
  -- aucune politique de lecture ne l'expose, et `invitation_preview` ne le
  -- rend jamais.
  --
  -- Deux UUID plutôt que `gen_random_bytes` : cette fonction vient de
  -- `pgcrypto`, que Supabase installe dans le schéma `extensions` et que
  -- PGlite n'a pas du tout. Le banc d'essai refusait la migration, et un
  -- couplage à un schéma d'hébergeur pour tirer des octets au hasard n'a pas
  -- de raison d'être. 64 caractères hexadécimaux, ~244 bits d'entropie :
  -- largement au-delà de ce qu'un jeton d'invitation demande.
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid references profiles (id) on delete set null,
  -- Une invitation qui traîne est une porte ouverte. Quinze jours suffisent.
  expires_at timestamptz not null default now() + interval '15 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Une seule invitation vivante par adresse et par organisation. Réinviter
  -- quelqu'un remplace l'ancienne plutôt que d'en empiler une seconde.
  unique (org_id, email)
);

comment on table organization_invitations is
  'Invitations en attente de compte. Le jeton est le secret : il ne sort que par courriel.';

create index if not exists organization_invitations_pending_idx
  on organization_invitations (org_id) where accepted_at is null;

alter table organization_invitations enable row level security;

/**
 * ⚠️ **L'invité ne lit pas cette table**, et c'est volontaire.
 *
 * Lui ouvrir une politique « je vois l'invitation dont je connais le jeton »
 * demanderait de lui accorder `select` sur la table, donc sur la colonne
 * `token` : un droit de colonne ne distingue pas les lignes, et la RLS ne
 * distingue pas les colonnes. Il pourrait alors lire le jeton des invitations
 * qu'il voit — et en voir suffisamment pour que ce soit un problème.
 *
 * Tout passe donc par deux fonctions `security definer` : `invitation_preview`
 * pour afficher qui invite et où, `accept_invitation` pour entrer. Seuls les
 * dirigeants de l'organisation lisent la table, et pour la gérer.
 */
drop policy if exists organization_invitations_manage on organization_invitations;
create policy organization_invitations_manage on organization_invitations
  for all
  using (app.has_org_role(org_id, array['owner', 'admin', 'manager']::org_role[]) or app.is_admin())
  with check (app.has_org_role(org_id, array['owner', 'admin', 'manager']::org_role[]) or app.is_admin());

-- Lecture et retrait par l'équipe dirigeante ; l'écriture passe par la
-- fonction, qui contrôle le rôle demandé contre le type d'organisation.
revoke all on organization_invitations from anon, authenticated;
grant delete on organization_invitations to authenticated;

-- ⚠️ **Énumération positive, et non `grant select` suivi d'un `revoke select
-- (token)`.** Postgres ne retire pas un droit de colonne accordé au niveau de
-- la table : un `revoke` par colonne ne mord que sur un `grant` par colonne,
-- et sinon il réussit sans rien changer. Constaté ici même — le jeton restait
-- lisible par le propriétaire de la structure, sans la moindre erreur. Même
-- piège et même remède que la migration 0036 sur `organizations`.
--
-- `token` est donc simplement **absent de cette liste**, et le restera : il
-- n'a pas à être recopié, le courriel porte le lien.
grant select (
  id, org_id, email, role, invited_by, expires_at, accepted_at, accepted_by, created_at
) on organization_invitations to authenticated;

/**
 * Inviter quelqu'un.
 *
 * Le rôle demandé est contrôlé ici contre le type d'organisation : la
 * contrainte `role_matches_org_type` de `organization_members` ne s'appliquera
 * qu'à l'acceptation, c'est-à-dire des jours plus tard, chez quelqu'un d'autre.
 * Laisser passer un rôle impossible produirait une invitation qui échoue au
 * moment le plus embarrassant.
 */
create or replace function public.invite_member(
  org uuid,
  adresse text,
  role_demande public.org_role
)
returns public.organization_invitations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.organization_invitations;
  genre public.org_type;
  propre text := lower(btrim(adresse));
begin
  -- ⚠️ `public.org_role[]` et non `org_role[]` : cette fonction porte
  -- `set search_path = ''`, donc aucun type n'est résolu sans son schéma. Le
  -- message d'erreur — « type "org_role[]" does not exist » — désigne le type
  -- et non la fonction, ce qui envoie chercher au mauvais endroit. Les
  -- politiques plus haut n'ont pas ce problème : elles s'évaluent dans le
  -- chemin de recherche de la session.
  if not app.has_org_role(org, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Seule la direction de la structure peut inviter.'
      using errcode = 'insufficient_privilege';
  end if;

  if propre !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Cette adresse e-mail n''est pas valide.' using errcode = 'check_violation';
  end if;

  select o.type into genre from public.organizations o where o.id = org;

  if genre is null then
    raise exception 'Organisation introuvable.' using errcode = 'no_data_found';
  end if;

  if (genre = 'company'
        and role_demande not in ('owner', 'admin', 'organizer', 'approver', 'finance', 'viewer'))
     or (genre = 'partner'
        and role_demande not in ('owner', 'manager', 'staff', 'accountant')) then
    raise exception 'Ce rôle n''existe pas dans ce type de structure.'
      using errcode = 'check_violation';
  end if;

  -- Déjà membre : le dire, plutôt que d'envoyer une invitation qui sera
  -- refusée à l'acceptation.
  if exists (
    select 1 from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = org and lower(u.email) = propre and m.status = 'active'
  ) then
    raise exception 'Cette personne fait déjà partie de l''équipe.'
      using errcode = 'unique_violation';
  end if;

  -- Réinviter remplace : un nouveau jeton, une nouvelle échéance. L'ancien
  -- lien cesse de fonctionner, ce qui est le comportement attendu.
  insert into public.organization_invitations (org_id, email, role, invited_by)
  values (org, propre, role_demande, auth.uid())
  on conflict (org_id, email) do update
    set role = excluded.role,
        invited_by = excluded.invited_by,
        token = replace(gen_random_uuid()::text, '-', '')
                || replace(gen_random_uuid()::text, '-', ''),
        expires_at = now() + interval '15 days',
        accepted_at = null,
        accepted_by = null,
        created_at = now()
  returning * into ligne;

  perform app.log_event('organization', org, 'invite', null, propre,
    jsonb_build_object('role', role_demande));

  return ligne;
end;
$$;

revoke execute on function public.invite_member(uuid, text, public.org_role) from public, anon;
grant execute on function public.invite_member(uuid, text, public.org_role) to authenticated;

/**
 * Ce qu'on montre avant d'accepter.
 *
 * Rend le strict nécessaire pour décider — qui invite, pour quelle structure,
 * à quel titre — et **jamais le jeton**. Accessible sans session : l'invité
 * arrive souvent avant d'avoir un compte, et doit pouvoir lire de quoi il
 * s'agit avant de s'inscrire.
 */
create or replace function public.invitation_preview(jeton text)
returns table (
  org_name text,
  org_type public.org_type,
  role public.org_role,
  email text,
  expired boolean,
  already_accepted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(o.brand_name, o.legal_name),
    o.type,
    i.role,
    i.email::text,
    i.expires_at < now(),
    i.accepted_at is not null
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = jeton;
$$;

revoke execute on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

/**
 * Entrer dans l'équipe.
 *
 * ⚠️ **L'adresse du compte doit être celle de l'invitation.** Sans ce
 * contrôle, un lien transféré — ou simplement lu par-dessus une épaule —
 * ferait entrer n'importe qui dans une structure, avec le rôle qu'on y avait
 * mis. C'est le seul endroit où ce contrôle peut avoir lieu : au moment de
 * l'invitation, le compte n'existe pas encore.
 */
create or replace function public.accept_invitation(jeton text)
returns public.organization_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  ligne public.organization_members;
  mon_email text;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour rejoindre cette équipe.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into invitation from public.organization_invitations where token = jeton;

  if invitation.id is null then
    raise exception 'Cette invitation n''existe pas ou a été remplacée.'
      using errcode = 'no_data_found';
  end if;

  if invitation.accepted_at is not null then
    raise exception 'Cette invitation a déjà été utilisée.' using errcode = 'check_violation';
  end if;

  if invitation.expires_at < now() then
    raise exception 'Cette invitation a expiré. Demandez-en une nouvelle.'
      using errcode = 'check_violation';
  end if;

  select lower(u.email) into mon_email from auth.users u where u.id = auth.uid();

  if mon_email is distinct from lower(invitation.email::text) then
    raise exception 'Cette invitation a été envoyée à %. Connectez-vous avec cette adresse.',
      invitation.email using errcode = 'insufficient_privilege';
  end if;

  insert into public.organization_members (org_id, user_id, role, status, invited_by, joined_at)
  values (invitation.org_id, auth.uid(), invitation.role, 'active', invitation.invited_by, now())
  on conflict (org_id, user_id) do update
    set status = 'active', joined_at = coalesce(public.organization_members.joined_at, now())
  returning * into ligne;

  update public.organization_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;

  perform app.log_event('organization', invitation.org_id, 'join', null, invitation.role::text,
    jsonb_build_object('invitation', invitation.id));

  return ligne;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

/**
 * L'invité prévenu, par la file.
 *
 * Le lien porte le jeton : c'est la seule sortie de cette colonne, et la
 * raison pour laquelle le courriel ne peut pas être remplacé par un message
 * dans la plateforme — l'invité n'y a pas encore de compte.
 */
create or replace function app.enqueue_invitation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nom text;
begin
  select coalesce(o.brand_name, o.legal_name) into nom
  from public.organizations o where o.id = new.org_id;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values (
    'email',
    new.email::text,
    'member.invited',
    new.id,
    jsonb_build_object('orgName', nom, 'role', new.role, 'token', new.token),
    new.org_id
  )
  on conflict (kind, ref_id, recipient) do update
    -- Réinviter régénère le jeton : la ligne en file doit porter le nouveau,
    -- sans quoi le second courriel enverrait un lien déjà mort.
    set payload = excluded.payload, status = 'pending', attempts = 0, last_error = null;

  return new;
end;
$$;

drop trigger if exists organization_invitations_notify on organization_invitations;
create trigger organization_invitations_notify
  after insert or update of token on organization_invitations
  for each row execute function app.enqueue_invitation_notification();
