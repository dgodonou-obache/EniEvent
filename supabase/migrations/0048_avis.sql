-- =============================================================================
-- 0048 — Les avis
--
-- `listings.rating_avg` et `partner_profiles.rating_avg` existent depuis la
-- migration 0002, avec ce commentaire : « Statistiques recalculées par
-- déclencheur au fil des devis et des avis ». **Ce déclencheur n'a jamais
-- existé**, et aucune table d'avis non plus — même histoire
-- qu'`acceptance_rate`. Cette migration écrit enfin ce qui était annoncé.
--
-- ⚠️ **Le produit n'a aujourd'hui aucune prestation réalisée** — mesuré sur la
-- production : 17 commandes, dont 12 annulées et 5 en attente de règlement, et
-- zéro paiement encaissé. Ce lot démarre donc sans une seule donnée. Ce n'est
-- pas une raison de le reporter, c'est la raison de le faire maintenant : la
-- plomberie doit exister **avant** les premières vraies réservations, sans quoi
-- la première vague d'avis — la plus difficile à obtenir — se perd.
--
-- -----------------------------------------------------------------------------
-- Les trois décisions qui structurent tout le reste
-- -----------------------------------------------------------------------------
--
-- **1. Rien dans les données ne dit qu'une prestation a eu lieu.** `order_status`
-- vaut `pending_payment`, `deposit_paid`, `paid`, `cancelled` ou `refunded` :
-- aucun état ne signifie « réalisée ». On n'en ajoute pas. Un état que personne
-- ne marquerait serait une colonne morte de plus, exactement comme
-- `acceptance_rate` l'a été un an durant. L'éligibilité se **déduit** donc de
-- trois faits vérifiables, et le déclencheur ci-dessous les impose :
--
--     la commande est celle de l'auteur
--     au moins un règlement est encaissé
--     coalesce(end_date, event_date) est dépassée
--
-- Imposé par un **déclencheur**, pas par la RLS : la RLS dit quelles lignes,
-- jamais à quelles conditions (§3 du guide). Et pas en tête d'une Server
-- Action : garder l'entrée de la table couvre tous les chemins (§2).
--
-- **2. Le tri par défaut du catalogue est déjà `rating_avg desc`**
-- (`src/lib/listings.ts:184`). Il ne trie rien faute de données ; **au premier
-- avis déposé, le catalogue entier se réordonne sur une seule opinion.** D'où
-- `rating_sort` dans la vue de recherche : une note ne pèse sur le classement
-- qu'à partir de **trois avis**. En dessous, l'annonce affiche sa note sans en
-- tirer avantage. Sans ce seuil, le premier client mécontent — ou le premier
-- ami complaisant — décide de la vitrine.
--
-- **3. L'auteur ne peut pas être affiché depuis `profiles`.** `profiles_select_own`
-- réserve cette table à son propriétaire et à l'administration (0002:337), et
-- il n'est pas question de l'ouvrir pour signer un avis. Le libellé est donc
-- **calculé à l'écriture et stocké** (`author_label`), réduit au prénom et à
-- l'initiale. Deux bénéfices qui n'en font qu'un : rien de public ne pointe
-- vers l'identité du client, et la signature survit à un changement de nom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Comment signer un avis
--
-- « Clara Gbaguidi » devient « Clara G. ». Un nom en un seul mot reste tel
-- quel ; un profil sans nom donne « Un client », qui est la vérité plutôt
-- qu'un vide.
-- -----------------------------------------------------------------------------
create or replace function app.review_label(auteur uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nom is null or btrim(nom) = '' then 'Un client'
    when position(' ' in btrim(nom)) = 0 then btrim(nom)
    else split_part(btrim(nom), ' ', 1) || ' ' ||
         upper(substr(split_part(btrim(nom), ' ', 2), 1, 1)) || '.'
  end
  from (
    select p.full_name as nom from public.profiles p where p.id = auteur
  ) s;
$$;

comment on function app.review_label(uuid) is
  'Signature publique d''un avis : prénom + initiale. Calculée à l''écriture '
  'et stockée, parce que profiles n''est lisible que par son propriétaire.';

-- -----------------------------------------------------------------------------
-- La table
--
-- **Un avis par commande** (`order_id unique`). Ce n'est pas une limite
-- technique mais la définition : un avis porte sur une prestation, et une
-- prestation est une commande. Deux avis sur la même feraient deux voix pour
-- un client.
--
-- **Le droit de réponse vit sur la même ligne.** Une réponse n'a pas
-- d'existence propre — on ne la cherche jamais seule, on ne la trie pas, on ne
-- la compte pas. Une table séparée imposerait une jointure à chaque affichage
-- pour ne jamais rien gagner.
--
-- `listing_id` est **nullable, et ce n'est pas un oubli** : une commande née
-- d'un devis accepté n'a pas d'annonce (`orders.listing_id` reste nul,
-- migration 0029). Cet avis-là note le prestataire sans noter d'annonce, ce
-- qui est exact — le devis portait sur un projet, pas sur une fiche.
-- -----------------------------------------------------------------------------
create table reviews (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null unique references orders (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  -- Signature publique, figée à l'écriture. Voir app.review_label.
  author_label text not null,

  org_id uuid not null references organizations (id) on delete cascade,
  listing_id uuid references listings (id) on delete set null,

  rating smallint not null check (rating between 1 and 5),
  -- Facultatif : une note seule est un avis valable, et exiger un texte
  -- ferait taire ceux qui n'ont rien de particulier à dire — c'est-à-dire les
  -- clients satisfaits.
  body text check (body is null or length(btrim(body)) between 10 and 2000),

  -- Droit de réponse du prestataire. Une seule, écrite par reply_to_review.
  reply text check (reply is null or length(btrim(reply)) between 10 and 2000),
  replied_at timestamptz,

  -- Modération. Un avis masqué sort des moyennes mais reste lisible par son
  -- auteur, par le prestataire concerné et par l'administration : on ne
  -- supprime pas la parole de quelqu'un sans qu'il puisse la relire.
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by uuid references profiles (id) on delete set null,
  -- Posée quand l'administration rétablit un avis masqué. Elle vaut
  -- **immunité** : un nouveau signalement ne le masquera plus (voir 0049).
  reinstated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reply_has_date check ((reply is null) = (replied_at is null)),
  constraint hidden_has_reason check ((hidden_at is null) = (hidden_reason is null))
);

comment on table reviews is
  'Avis clients. Un par commande, publié immédiatement, éligibilité imposée '
  'par app.guard_review_eligibility. Migration 0048.';

create index reviews_listing_idx on reviews (listing_id, created_at desc)
  where hidden_at is null;
create index reviews_org_idx on reviews (org_id, created_at desc);
create index reviews_author_idx on reviews (author_id, created_at desc);
-- Les avis sans réponse, dans l'ordre d'arrivée : c'est la file de /pro/avis.
create index reviews_sans_reponse_idx on reviews (org_id, created_at)
  where reply is null and hidden_at is null;

create trigger reviews_updated_at
  before update on reviews
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Qui a le droit de donner son avis
--
-- Le déclencheur **dérive** tout ce qui pourrait être menti : l'auteur,
-- l'organisation notée, l'annonce, la signature. Le formulaire n'envoie que la
-- commande, la note et le texte. Rien de ce qui compte ne traverse le réseau.
-- -----------------------------------------------------------------------------
create or replace function app.guard_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  -- La clé de service (seeds, démonstration) garde la main sur `author_id` ;
  -- un utilisateur ne peut écrire que sous son nom.
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;

  select o.client_id,
         o.org_id,
         o.listing_id,
         o.status,
         coalesce(o.end_date, o.event_date) as fin
    into c
  from public.orders o
  where o.id = new.order_id;

  if not found then
    raise exception 'Cette réservation est introuvable.' using errcode = 'no_data_found';
  end if;

  if c.client_id is distinct from new.author_id then
    raise exception 'Seul le client d''une réservation peut en donner son avis.'
      using errcode = 'insufficient_privilege';
  end if;

  if c.status in ('cancelled', 'refunded') then
    raise exception 'Une réservation annulée ne se note pas : la prestation n''a pas eu lieu.'
      using errcode = 'check_violation';
  end if;

  -- Un acompte suffit : la prestation a été rendue, le solde peut traîner.
  if not exists (
    select 1 from public.payments p
    where p.order_id = new.order_id and p.status = 'paid'
  ) then
    raise exception 'Vous pourrez donner votre avis une fois votre règlement encaissé.'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ Pas d'état « réalisée » dans `order_status` : la seule notion de passé
  -- est calendaire. Une commande sans aucune date n'est donc jamais notable —
  -- mieux vaut le dire que de laisser noter une prestation à venir.
  if c.fin is null then
    raise exception 'Cette réservation n''a pas de date : son avis ne peut pas être ouvert.'
      using errcode = 'check_violation';
  end if;

  if c.fin >= current_date then
    raise exception 'Votre avis sera possible dès le lendemain de la prestation.'
      using errcode = 'check_violation';
  end if;

  -- Dérivé, jamais reçu.
  new.org_id := c.org_id;
  new.listing_id := c.listing_id;
  new.author_label := app.review_label(new.author_id);

  -- Un avis naît publié, sans réponse et sans masquage, quoi que demande
  -- l'appelant. Les droits de colonne l'interdisent déjà ; ceci tient si un
  -- `grant` trop large revenait.
  new.reply := null;
  new.replied_at := null;
  new.hidden_at := null;
  new.hidden_reason := null;
  new.hidden_by := null;
  new.reinstated_at := null;

  return new;
end;
$$;

create trigger reviews_guard_eligibility
  before insert on reviews
  for each row execute function app.guard_review_eligibility();

-- -----------------------------------------------------------------------------
-- Corriger son avis : oui, tant que personne n'a répondu
--
-- Une faute de frappe se corrige. Mais une fois que le prestataire a répondu
-- publiquement, modifier l'avis rendrait sa réponse incompréhensible — il
-- aurait répondu à un texte que plus personne ne peut lire. Pas de délai, pas
-- d'horloge : une règle sans état, donc sans dérive.
-- -----------------------------------------------------------------------------
create or replace function app.guard_review_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or app.is_admin() then
    return new;
  end if;

  if new.rating is distinct from old.rating or new.body is distinct from old.body then
    if old.replied_at is not null then
      raise exception 'Le prestataire a déjà répondu : votre avis ne se modifie plus.'
        using errcode = 'check_violation';
    end if;

    if old.hidden_at is not null then
      raise exception 'Cet avis est en cours d''examen : il ne se modifie pas.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger reviews_guard_update
  before update on reviews
  for each row execute function app.guard_review_update();

-- -----------------------------------------------------------------------------
-- Le recalcul promis depuis la migration 0002
--
-- Deux cibles à chaque fois : l'annonce, quand il y en a une, et **toujours**
-- le profil du partenaire — qui agrège aussi les avis venus de devis, sans
-- annonce. Les avis masqués en sortent : un avis retiré ne doit plus peser.
--
-- ⚠️ Cette fonction est le seul auteur légitime de `listings.rating_avg`, que
-- la migration 0047 vient de refermer. Elle est `security definer` et ignore
-- donc les droits de colonne — mais **pas** le déclencheur de garde, car
-- `auth.uid()` ne change pas en entrant dans une fonction `security definer` :
-- il vaut toujours l'identifiant du client qui dépose son avis. D'où le
-- drapeau `app.recalcul`, posé ici et nulle part ailleurs.
--
-- Effet de bord assumé : `listings.updated_at` avance. C'est exact — la fiche
-- publique a changé, sa note en fait partie, et un `lastmod` de plan de site
-- qui l'ignorerait serait faux.
-- -----------------------------------------------------------------------------
create or replace function app.refresh_ratings(cible_org uuid, cible_annonce uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.recalcul', 'oui', true);

  if cible_annonce is not null then
    update public.listings l
    set rating_avg = calcul.moyenne,
        rating_count = calcul.nombre
    from (
      select round(avg(r.rating)::numeric, 2) as moyenne, count(*)::integer as nombre
      from public.reviews r
      where r.listing_id = cible_annonce and r.hidden_at is null
    ) calcul
    where l.id = cible_annonce;
  end if;

  if cible_org is not null then
    update public.partner_profiles p
    set rating_avg = calcul.moyenne,
        rating_count = calcul.nombre
    from (
      select round(avg(r.rating)::numeric, 2) as moyenne, count(*)::integer as nombre
      from public.reviews r
      where r.org_id = cible_org and r.hidden_at is null
    ) calcul
    where p.org_id = cible_org;
  end if;

  perform set_config('app.recalcul', 'non', true);
end;
$$;

comment on function app.refresh_ratings(uuid, uuid) is
  'Recalcule rating_avg et rating_count sur l''annonce et sur le profil du '
  'partenaire, avis masqués exclus. Seul auteur légitime de ces colonnes '
  'depuis la migration 0047.';

create or replace function app.reviews_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les deux côtés d'une mutation : un avis masqué, ou déplacé d'une annonce à
  -- l'autre, doit faire baisser l'ancienne autant que monter la nouvelle.
  if tg_op <> 'INSERT' then
    perform app.refresh_ratings(old.org_id, old.listing_id);
  end if;

  if tg_op <> 'DELETE' then
    perform app.refresh_ratings(new.org_id, new.listing_id);
  end if;

  return null;
end;
$$;

create trigger reviews_refresh_ratings
  after insert or update or delete on reviews
  for each row execute function app.reviews_refresh();

-- -----------------------------------------------------------------------------
-- Un compte anonymisé n'est plus signé
--
-- `delete_my_account` (0043) anonymise plutôt que d'effacer dès qu'une
-- histoire existe — et un avis en est une. Sans ce déclencheur, « Clara G. »
-- continuerait de signer un avis après que Clara a demandé à être oubliée.
--
-- Posé sur la table plutôt que dans `delete_my_account` : c'est la règle du §2
-- du guide, et elle couvre aussi une anonymisation faite à la main au support.
-- -----------------------------------------------------------------------------
create or replace function app.anonymise_review_labels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reviews
  set author_label = 'Un client'
  where author_id = new.id and author_label <> 'Un client';

  return null;
end;
$$;

create trigger profiles_anonymise_reviews
  after update of deleted_at on profiles
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function app.anonymise_review_labels();

-- -----------------------------------------------------------------------------
-- Le droit de réponse
--
-- Par fonction et non par politique : une politique d'`update` sur `reviews`
-- ouvrirait la ligne entière au prestataire — donc la note elle-même, exactement
-- la faille que la migration 0047 vient de refermer sur `listings`. Les droits
-- de colonne ne sauraient pas distinguer l'auteur du prestataire, les deux
-- étant `authenticated`.
--
-- Une seule réponse. Un échange se poursuit dans la messagerie, pas sous un
-- avis public : laisser répondre indéfiniment transformerait la fiche en
-- tribune, et le dernier mot reviendrait toujours au prestataire.
-- -----------------------------------------------------------------------------
create or replace function public.reply_to_review(avis uuid, texte text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  t text := btrim(coalesce(texte, ''));
begin
  if length(t) < 10 or length(t) > 2000 then
    raise exception 'Une réponse fait entre 10 et 2000 caractères.'
      using errcode = 'check_violation';
  end if;

  select r.org_id, r.replied_at, r.hidden_at into a
  from public.reviews r where r.id = avis;

  if not found then
    raise exception 'Cet avis est introuvable.' using errcode = 'no_data_found';
  end if;

  if not app.has_org_role(a.org_id, array['owner', 'manager']::public.org_role[]) then
    raise exception 'Seul le prestataire concerné peut répondre à un avis.'
      using errcode = 'insufficient_privilege';
  end if;

  if a.replied_at is not null then
    raise exception 'Vous avez déjà répondu à cet avis.' using errcode = 'check_violation';
  end if;

  if a.hidden_at is not null then
    raise exception 'Cet avis est en cours d''examen : il n''est pas affiché.'
      using errcode = 'check_violation';
  end if;

  update public.reviews
  set reply = t, replied_at = now()
  where id = avis;

  perform app.log_event('review', avis, 'reply');
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Modération
--
-- ⚠️ **Le circuit de modération des annonces ne journalise rien et ne prévient
-- personne** (`/admin/moderation`). Ce n'est pas un modèle à reprendre : un
-- avis retiré est une parole supprimée, et la trace de qui l'a retirée et
-- pourquoi est ce qui distingue une modération d'un arbitraire.
-- -----------------------------------------------------------------------------
create or replace function public.hide_review(avis uuid, motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := btrim(coalesce(motif, ''));
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''équipe ÉniEvent.' using errcode = 'insufficient_privilege';
  end if;

  -- Un motif de quinze caractères au moins : c'est lui qu'on relira dans six
  -- mois si l'auteur réclame, et « spam » n'expliquera rien.
  if length(m) < 15 then
    raise exception 'Indiquez un motif d''au moins 15 caractères.' using errcode = 'check_violation';
  end if;

  update public.reviews
  set hidden_at = now(), hidden_reason = m, hidden_by = auth.uid()
  where id = avis and hidden_at is null;

  if not found then
    raise exception 'Cet avis est introuvable ou déjà masqué.' using errcode = 'no_data_found';
  end if;

  perform app.log_event('review', avis, 'hide', 'visible', 'masque',
    jsonb_build_object('motif', m));
end;
$$;

revoke all on function public.hide_review(uuid, text) from public, anon;
grant execute on function public.hide_review(uuid, text) to authenticated;

create or replace function public.reinstate_review(avis uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''équipe ÉniEvent.' using errcode = 'insufficient_privilege';
  end if;

  update public.reviews
  set hidden_at = null, hidden_reason = null, hidden_by = null, reinstated_at = now()
  where id = avis and hidden_at is not null;

  if not found then
    raise exception 'Cet avis est introuvable ou déjà visible.' using errcode = 'no_data_found';
  end if;

  perform app.log_event('review', avis, 'reinstate', 'masque', 'visible');
end;
$$;

revoke all on function public.reinstate_review(uuid) from public, anon;
grant execute on function public.reinstate_review(uuid) to authenticated;

comment on function public.reinstate_review(uuid) is
  'Rétablit un avis masqué et pose reinstated_at, qui vaut immunité : un '
  'nouveau signalement ne le masquera plus (migration 0049).';

-- -----------------------------------------------------------------------------
-- Ce que l'administration a besoin de lire, et que personne d'autre ne voit
--
-- `hidden_reason` et `hidden_by` sortent du `grant select` : un motif de
-- modération cite souvent celui qui a signalé. Un administrateur étant lui
-- aussi `authenticated`, un droit de colonne ne saurait pas l'en distinguer —
-- d'où cette fonction, sur le moule d'`admin_users()` (0040) et
-- d'`admin_companies()` (0036).
-- -----------------------------------------------------------------------------
create or replace function public.admin_reviews(etat text default 'tous')
returns table (
  id uuid,
  created_at timestamptz,
  rating smallint,
  body text,
  author_label text,
  reply text,
  replied_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  org_id uuid,
  org_name text,
  listing_id uuid,
  listing_title text,
  order_reference text
)
language sql
security definer
set search_path = ''
stable
as $$
  select r.id, r.created_at, r.rating, r.body, r.author_label,
         r.reply, r.replied_at, r.hidden_at, r.hidden_reason,
         r.org_id,
         coalesce(o.brand_name, o.legal_name) as org_name,
         r.listing_id,
         l.title as listing_title,
         c.reference as order_reference
  from public.reviews r
  join public.organizations o on o.id = r.org_id
  left join public.listings l on l.id = r.listing_id
  join public.orders c on c.id = r.order_id
  where app.is_admin()
    and case etat
      when 'masques' then r.hidden_at is not null
      when 'visibles' then r.hidden_at is null
      else true
    end
  order by r.created_at desc;
$$;

revoke all on function public.admin_reviews(text) from public, anon;
grant execute on function public.admin_reviews(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Plafond de débit
--
-- Un avis ne peut naître que d'une commande encaissée et terminée, et il n'y en
-- a qu'un par commande : le robinet est donc borné par la réalité, pas par un
-- compteur. **Rien à plafonner ici** — et le dire évite qu'on cherche.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- RLS et privilèges
--
-- Lecture publique des avis non masqués : c'est leur raison d'être. Un avis
-- masqué reste lisible par son auteur, par le prestataire concerné et par
-- l'administration.
--
-- Aucune politique de suppression, et aucun `grant delete` : **un avis ne
-- s'efface pas**, il se masque. Un effacement ferait disparaître la trace avec
-- la parole, et le prestataire comme l'auteur ont le droit de relire ce qui a
-- été dit.
-- -----------------------------------------------------------------------------
alter table reviews enable row level security;

create policy reviews_select on reviews
  for select using (
    hidden_at is null
    or author_id = auth.uid()
    or app.is_org_member(org_id)
    or app.is_admin()
  );

-- ⚠️ L'appartenance s'écrit sur les colonnes de la ligne, et `author_id` est
-- posé par le déclencheur `before insert` : la clause `with check` d'une
-- politique s'évalue **après** les déclencheurs `before`, donc sur la valeur
-- dérivée. C'est ce qui permet au formulaire de ne pas envoyer d'auteur.
create policy reviews_insert on reviews
  for insert with check (author_id = auth.uid());

create policy reviews_update_own on reviews
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ⚠️ **Énumération positive** (§3 du guide) : `hidden_reason` et `hidden_by`
-- restent hors de toute lecture directe. Un `revoke select (hidden_reason)`
-- aurait été accepté sans erreur et sans effet.
revoke all on reviews from anon, authenticated;

grant select (
  id, order_id, author_id, author_label, org_id, listing_id,
  rating, body, reply, replied_at, hidden_at, reinstated_at,
  created_at, updated_at
) on reviews to anon, authenticated;

-- Seules trois colonnes s'écrivent depuis un formulaire. Tout le reste est
-- dérivé par le déclencheur ou posé par une fonction.
grant insert (order_id, rating, body) on reviews to authenticated;
grant update (rating, body) on reviews to authenticated;

comment on column reviews.hidden_reason is
  'Hors de toute lecture directe : un motif de modération cite souvent celui '
  'qui a signalé. Lecture par public.admin_reviews(). Migration 0048.';

-- -----------------------------------------------------------------------------
-- Le classement n'écoute pas une voix seule
--
-- `rating_sort` est nulle en dessous de trois avis, et `nullsFirst: false`
-- range donc ces annonces après celles qui ont une note établie — au lieu de
-- les propulser en tête sur un unique « 5 ».
--
-- ⚠️ `create or replace view` impose de conserver les colonnes existantes dans
-- le même ordre : la nouvelle ne peut qu'être ajoutée en fin de liste.
-- -----------------------------------------------------------------------------
create or replace view listing_search
with (security_invoker = true)
as
select
  l.id,
  l.slug,
  l.title,
  l.description,
  l.city,
  l.district,
  l.kind,
  l.cover_url,
  l.currency,
  l.booking_mode,
  l.price_from,
  l.min_price,
  l.rating_avg,
  l.rating_count,
  l.latitude,
  l.longitude,
  l.status,
  l.is_paused,
  l.published_at,
  l.org_id,

  c.slug   as category_slug,
  c.name   as category_name,
  parent.slug as family_slug,
  parent.name as family_name,

  o.slug        as org_slug,
  coalesce(o.brand_name, o.legal_name) as org_name,
  o.status      as org_status,
  pp.is_verified as org_verified,

  coalesce(
    v.capacity_standing,
    v.capacity_seated,
    v.capacity_cocktail,
    s.max_guests
  ) as max_capacity,

  v.capacity_seated,
  v.capacity_standing,
  v.surface_m2,
  s.min_guests,

  coalesce(
    (
      select array_agg(a.slug order by a.slug)
      from listing_amenities la
      join amenities a on a.id = la.amenity_id
      where la.listing_id = l.id
    ),
    '{}'::text[]
  ) as amenity_slugs,

  concat_ws(' ', l.title, l.city, l.district, c.name, o.brand_name, o.legal_name) as search_text,

  l.price_from_unit,

  -- Note retenue pour le classement : à partir de trois avis seulement.
  case when l.rating_count >= 3 then l.rating_avg end as rating_sort

from listings l
join categories c on c.id = l.category_id
left join categories parent on parent.id = c.parent_id
join organizations o on o.id = l.org_id
left join partner_profiles pp on pp.org_id = o.id
left join venue_details v on v.listing_id = l.id
left join service_details s on s.listing_id = l.id;

grant select on listing_search to anon, authenticated;

comment on column listing_search.rating_sort is
  'rating_avg, mais seulement à partir de trois avis. En dessous, nulle : une '
  'annonce affiche sa note sans peser sur le classement. Migration 0048.';

-- -----------------------------------------------------------------------------
-- Notifications
--
-- Un partenaire ne consulte pas `/pro/avis` de lui-même (§8 du guide). Un avis
-- reçu appelle une réponse, et une réponse appelle d'être lue.
--
-- La mise en file se fait **en base** : savoir où écrire au partenaire demande
-- de lire `organizations.billing_email`, que le client n'a pas le droit de lire
-- (migration 0036) ; et l'adresse du client vit dans `auth.users`, que
-- personne ne lit depuis `public`.
--
-- `ref_id` = l'identifiant de l'avis. L'unicité `(kind, ref_id, recipient)` de
-- `notifications` suffit donc : un avis ne se dépose qu'une fois, et une
-- réponse est unique par construction.
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_review_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text;
  annonce text;
begin
  courriel := app.org_email(new.org_id);
  if courriel is null then
    return new;
  end if;

  select coalesce(l.title, o.listing_title) into annonce
  from public.orders o
  left join public.listings l on l.id = o.listing_id
  where o.id = new.order_id;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values ('email', courriel, 'review.received', new.id,
          jsonb_build_object(
            'rating', new.rating,
            'author', new.author_label,
            'listing', annonce,
            'hasBody', new.body is not null
          ),
          new.org_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger reviews_notify_received
  after insert on reviews
  for each row execute function app.enqueue_review_received();

create or replace function app.enqueue_review_replied()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text;
  enseigne text;
begin
  select u.email::text into courriel
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = new.author_id;

  if courriel is null then
    return new;
  end if;

  select coalesce(o.brand_name, o.legal_name) into enseigne
  from public.organizations o where o.id = new.org_id;

  insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
  values ('email', courriel, 'review.replied', new.id,
          jsonb_build_object('partner', enseigne, 'rating', new.rating),
          new.org_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger reviews_notify_replied
  after update of replied_at on reviews
  for each row
  when (new.replied_at is not null and old.replied_at is null)
  execute function app.enqueue_review_replied();
