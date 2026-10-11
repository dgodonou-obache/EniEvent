-- =============================================================================
-- 0050 — Un avis ne disparaît pas
--
-- **Décision de l'exploitant, qui renverse celle du 10 octobre 2026** (migration
-- 0049) : un avis signalé n'est plus retiré, ni automatiquement ni après examen.
--
-- Le motif donné est le bon, et il vaut d'être écrit ici plutôt que résumé :
-- **retirer un mauvais avis est un signe de méfiance envers la plateforme.** Un
-- visiteur qui ne voit que des bons avis n'en conclut pas que les prestataires
-- sont bons — il en conclut que le reste a été effacé, et ÉniEvent perd
-- exactement ce que ce lot devait lui donner. Le recours d'un partenaire est
-- donc **la réponse publique**, qui existe depuis la migration 0048 et devient
-- ici le seul.
--
-- Ce qui disparaît avec cette migration :
--
--   app.retirer_sur_signalement()   le retrait immédiat sur signalement
--   reviews.reinstated_at           l'immunité, qui n'avait de sens que contre lui
--   resolve_report()                ne touche plus à l'avis, il consigne une décision
--
-- Les trois bornes de la 0049 — partie concernée, immunité, plafond de débit —
-- n'étaient là que pour empêcher le retrait d'être une arme. Le retrait partant,
-- deux d'entre elles n'ont plus d'objet. **Le plafond de débit reste** : il borne
-- le volume de signalements, et ça n'a rien à voir.
--
-- -----------------------------------------------------------------------------
-- La seule chose qu'on garde, et la ligne exacte où on la garde
-- -----------------------------------------------------------------------------
--
-- ⚠️ **Un avis peut contenir autre chose qu'un reproche** : une insulte nommant
-- un salarié, un numéro de téléphone — qui contournerait d'un coup tout le
-- masquage des coordonnées de la messagerie (0037) —, l'adresse de quelqu'un.
-- « Un avis reste » ne peut pas vouloir dire « ÉniEvent ne peut rien faire de
-- ça » : ce n'est plus une question de confiance, c'est une obligation.
--
-- D'où la séparation que la 0049 confondait :
--
--   **La note ne bouge jamais.** Aucun avis ne quitte la moyenne, pour aucun
--   motif. `app.refresh_ratings` ne filtre plus rien. C'est la garantie
--   littérale demandée, et elle est désormais vraie en base plutôt que dans une
--   note d'intention.
--
--   **Le texte, et lui seul, peut être retiré** — par l'équipe, pour un motif
--   **publié sous l'avis**, et l'avis reste affiché avec ses étoiles. Le lecteur
--   voit « Commentaire retiré par ÉniEvent : propos injurieux ». La plateforme
--   ne cache pas qu'il s'est passé quelque chose, elle dit quoi.
--
-- Deux conséquences qui ne sautent pas aux yeux :
--
-- 1. **Retirer le texte ne soulage pas la note du partenaire.** C'est voulu :
--    sans cela, « contenu illicite » redeviendrait le moyen de faire baisser un
--    1/5, et on serait revenu au point de départ par la porte de service.
-- 2. **Le motif de modération devient public.** Il était fermé en 0048 parce
--    qu'un motif pouvait citer le signaleur ; il est maintenant écrit *pour le
--    lecteur*. C'est `redacted_by` — qui a tranché — qui reste fermé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Le retrait automatique s'en va
-- -----------------------------------------------------------------------------
drop trigger if exists reports_retirer_avis on reports;
drop function if exists app.retirer_sur_signalement();

-- -----------------------------------------------------------------------------
-- 2. « Masqué » devient « commentaire retiré »
--
-- Un renommage et non des colonnes neuves : les trois portent déjà exactement
-- la bonne information, et deux jeux de colonnes auraient laissé l'ancien se
-- remplir un jour par mégarde. Les noms comptent — `hidden_at` invitait à
-- masquer la ligne, `body_redacted_at` dit ce qui se passe vraiment.
-- -----------------------------------------------------------------------------
alter table reviews rename column hidden_at to body_redacted_at;
alter table reviews rename column hidden_reason to redaction_reason;
alter table reviews rename column hidden_by to redacted_by;

alter table reviews rename constraint hidden_has_reason to redaction_has_reason;

-- L'immunité n'avait de sens que contre le retrait sur signalement.
alter table reviews drop column reinstated_at;

comment on column reviews.body_redacted_at is
  'Date de retrait du **commentaire** par l''équipe. L''avis reste affiché, '
  'avec ses étoiles, et sa note continue de compter : seul le texte est '
  'remplacé par le motif. Migration 0050.';

comment on column reviews.redaction_reason is
  'Motif du retrait du commentaire, **publié sous l''avis**. Écrit pour le '
  'lecteur, pas pour le dossier : c''est ce qui distingue une modération '
  'assumée d''un effacement. Migration 0050.';

comment on column reviews.redacted_by is
  'Qui a retiré le commentaire. Hors de toute lecture directe : le motif est '
  'public, le modérateur non.';

-- -----------------------------------------------------------------------------
-- 3. La note ne bouge jamais
--
-- `where hidden_at is null` disparaît des deux agrégats. C'est la garantie
-- centrale de cette migration, et elle tient en une clause retirée.
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
      where r.listing_id = cible_annonce
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
      where r.org_id = cible_org
    ) calcul
    where p.org_id = cible_org;
  end if;

  perform set_config('app.recalcul', 'non', true);
end;
$$;

comment on function app.refresh_ratings(uuid, uuid) is
  'Recalcule rating_avg et rating_count sur l''annonce et sur le profil du '
  'partenaire. ⚠️ **Ne filtre rien** : aucun avis ne quitte la moyenne, pour '
  'aucun motif (migration 0050). Retirer un commentaire illicite ne soulage '
  'donc pas la note — sans quoi « contenu illicite » redeviendrait le moyen de '
  'faire disparaître un 1/5.';

-- Rattrape les lignes déjà en base : sans ce passage, une annonce dont un avis
-- avait été masqué garderait une note calculée sous l'ancienne règle, et rien
-- ne le signalerait.
do $$
declare
  cible record;
begin
  for cible in select distinct org_id, listing_id from public.reviews loop
    perform app.refresh_ratings(cible.org_id, cible.listing_id);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Tout avis est public
--
-- La politique n'a plus de cas particulier : il n'y a plus d'avis invisible.
-- Les index perdent leur prédicat pour la même raison.
-- -----------------------------------------------------------------------------
drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select using (true);

drop index if exists reviews_listing_idx;
create index reviews_listing_idx on reviews (listing_id, created_at desc);

drop index if exists reviews_sans_reponse_idx;
-- La file de `/pro/avis` : ce qui attend une réponse, le plus ancien d'abord.
-- C'est désormais le **seul** recours du partenaire, donc la seule file utile.
create index reviews_sans_reponse_idx on reviews (org_id, created_at)
  where reply is null;

-- -----------------------------------------------------------------------------
-- 5. Droits : le motif devient public, le modérateur non
--
-- ⚠️ Énumération positive, comme toujours : un `revoke select (redacted_by)`
-- serait accepté sans erreur et sans effet.
-- -----------------------------------------------------------------------------
revoke all on reviews from anon, authenticated;

grant select (
  id, order_id, author_id, author_label, org_id, listing_id,
  rating, body, reply, replied_at,
  body_redacted_at, redaction_reason,
  created_at, updated_at
) on reviews to anon, authenticated;

grant insert (order_id, rating, body) on reviews to authenticated;
grant update (rating, body) on reviews to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Retirer un commentaire, et le rendre
--
-- `hide_review` et `reinstate_review` disparaissent : leurs noms promettaient
-- de faire disparaître un avis, ce qui n'est plus possible. Garder les
-- anciennes signatures en coquilles aurait laissé un appel oublié quelque part
-- réussir sans rien faire — pire qu'une erreur.
-- -----------------------------------------------------------------------------
drop function if exists public.hide_review(uuid, text);
drop function if exists public.reinstate_review(uuid);

create or replace function public.redact_review_body(avis uuid, motif text)
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

  -- ⚠️ Ce motif est **affiché au public**, sous l'avis. D'où le minimum : il
  -- doit se lire comme une phrase, pas comme un code interne. « spam »
  -- n'expliquerait rien à personne.
  if length(m) < 15 then
    raise exception 'Indiquez un motif d''au moins 15 caractères : il sera publié sous l''avis.'
      using errcode = 'check_violation';
  end if;

  update public.reviews
  set body_redacted_at = now(), redaction_reason = m, redacted_by = auth.uid()
  where id = avis and body_redacted_at is null;

  if not found then
    raise exception 'Cet avis est introuvable, ou son commentaire est déjà retiré.'
      using errcode = 'no_data_found';
  end if;

  perform app.log_event('review', avis, 'redact_body', 'publie', 'retire',
    jsonb_build_object('motif', m));
end;
$$;

revoke all on function public.redact_review_body(uuid, text) from public, anon;
grant execute on function public.redact_review_body(uuid, text) to authenticated;

comment on function public.redact_review_body(uuid, text) is
  'Retire le **commentaire** d''un avis pour contenu illicite — insulte '
  'nominative, coordonnées, données personnelles. La note reste, l''avis reste '
  'affiché, et le motif est publié à la place du texte. Jamais pour un avis '
  'simplement sévère : un avis qui disparaît se lit comme un avis étouffé.';

create or replace function public.restore_review_body(avis uuid)
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
  set body_redacted_at = null, redaction_reason = null, redacted_by = null
  where id = avis and body_redacted_at is not null;

  if not found then
    raise exception 'Cet avis est introuvable, ou son commentaire est déjà publié.'
      using errcode = 'no_data_found';
  end if;

  perform app.log_event('review', avis, 'restore_body', 'retire', 'publie');
end;
$$;

revoke all on function public.restore_review_body(uuid) from public, anon;
grant execute on function public.restore_review_body(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Le droit de réponse, désormais seul recours
--
-- Il ne se refuse plus sur un avis dont le commentaire a été retiré : le
-- partenaire garde le droit de se justifier publiquement, et c'est même le cas
-- où il en a le plus besoin.
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

  select r.org_id, r.replied_at into a
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

  update public.reviews
  set reply = t, replied_at = now()
  where id = avis;

  perform app.log_event('review', avis, 'reply');
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Corriger son avis : la règle de garde suit le renommage
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

    -- Réécrire un commentaire retiré annulerait la modération sans qu'elle
    -- s'en aperçoive.
    if old.body_redacted_at is not null then
      raise exception 'Le commentaire de cet avis a été retiré : il ne se modifie plus. Votre note, elle, reste.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. L'éligibilité n'a plus de colonne d'immunité à neutraliser
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

  if not exists (
    select 1 from public.payments p
    where p.order_id = new.order_id and p.status = 'paid'
  ) then
    raise exception 'Vous pourrez donner votre avis une fois votre règlement encaissé.'
      using errcode = 'check_violation';
  end if;

  if c.fin is null then
    raise exception 'Cette réservation n''a pas de date : son avis ne peut pas être ouvert.'
      using errcode = 'check_violation';
  end if;

  if c.fin >= current_date then
    raise exception 'Votre avis sera possible dès le lendemain de la prestation.'
      using errcode = 'check_violation';
  end if;

  new.org_id := c.org_id;
  new.listing_id := c.listing_id;
  new.author_label := app.review_label(new.author_id);

  new.reply := null;
  new.replied_at := null;
  new.body_redacted_at := null;
  new.redaction_reason := null;
  new.redacted_by := null;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Trancher un signalement ne touche plus à l'avis
--
-- `upheld` et `dismissed` ne consignent plus qu'une décision. Retirer un
-- commentaire illicite est un **second geste**, explicite, par
-- `redact_review_body` — et l'écran d'administration le propose à côté. Les
-- enchaîner automatiquement ferait du signalement un bouton de suppression,
-- c'est-à-dire ce que cette migration défait.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_report(
  signalement uuid,
  issue public.report_status,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  n text := nullif(btrim(coalesce(note, '')), '');
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''équipe ÉniEvent.' using errcode = 'insufficient_privilege';
  end if;

  if issue = 'open' then
    raise exception 'Un signalement se tranche en « retenu » ou « écarté ».'
      using errcode = 'check_violation';
  end if;

  select r.status into s from public.reports r where r.id = signalement;

  if not found then
    raise exception 'Ce signalement est introuvable.' using errcode = 'no_data_found';
  end if;

  if s.status <> 'open' then
    raise exception 'Ce signalement a déjà été tranché.' using errcode = 'check_violation';
  end if;

  update public.reports
  set status = issue, resolution = n, resolved_at = now(), resolved_by = auth.uid()
  where id = signalement;

  perform app.log_event('report', signalement, 'resolve', 'open', issue::text,
    jsonb_build_object('note', n));
end;
$$;

revoke all on function public.resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.resolve_report(uuid, public.report_status, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Ce que l'administration lit
--
-- `etat` change de vocabulaire : il ne reste rien de « masqué ».
-- -----------------------------------------------------------------------------
drop function if exists public.admin_reviews(text);

create or replace function public.admin_reviews(etat text default 'tous')
returns table (
  id uuid,
  created_at timestamptz,
  rating smallint,
  body text,
  author_label text,
  reply text,
  replied_at timestamptz,
  body_redacted_at timestamptz,
  redaction_reason text,
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
         r.reply, r.replied_at, r.body_redacted_at, r.redaction_reason,
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
      when 'moderes' then r.body_redacted_at is not null
      when 'intacts' then r.body_redacted_at is null
      else true
    end
  order by r.created_at desc;
$$;

revoke all on function public.admin_reviews(text) from public, anon;
grant execute on function public.admin_reviews(text) to authenticated;

-- `review_hidden_at` devient `review_body_redacted_at` : l'écran des
-- signalements doit pouvoir dire si le commentaire a été retiré, mais il ne
-- peut plus dire qu'un avis a été « retiré », ce qui n'arrive plus.
drop function if exists public.admin_reports(text);

create or replace function public.admin_reports(etat text default 'ouverts')
returns table (
  id uuid,
  reference text,
  created_at timestamptz,
  target_type public.report_target,
  reason text,
  status public.report_status,
  resolution text,
  review_id uuid,
  review_rating smallint,
  review_body text,
  review_author text,
  review_body_redacted_at timestamptz,
  listing_id uuid,
  listing_title text,
  org_name text,
  reporter_label text,
  reporter_is_party boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.reference, s.created_at, s.target_type, s.reason, s.status, s.resolution,
         s.review_id, r.rating, r.body, r.author_label, r.body_redacted_at,
         s.listing_id,
         coalesce(l.title, rl.title) as listing_title,
         coalesce(ro.brand_name, ro.legal_name, lo.brand_name, lo.legal_name) as org_name,
         coalesce(p.full_name, 'Compte sans nom') as reporter_label,
         exists (
           select 1 from public.organization_members m
           where m.user_id = s.reporter_id
             and m.status = 'active'
             and m.org_id = coalesce(r.org_id, l.org_id)
         ) as reporter_is_party
  from public.reports s
  left join public.reviews r on r.id = s.review_id
  left join public.listings rl on rl.id = r.listing_id
  left join public.organizations ro on ro.id = r.org_id
  left join public.listings l on l.id = s.listing_id
  left join public.organizations lo on lo.id = l.org_id
  left join public.profiles p on p.id = s.reporter_id
  where app.is_admin()
    and case etat
      when 'ouverts' then s.status = 'open'
      when 'traites' then s.status <> 'open'
      else true
    end
  order by s.created_at desc;
$$;

revoke all on function public.admin_reports(text) from public, anon;
grant execute on function public.admin_reports(text) to authenticated;

comment on table reviews is
  'Avis clients. Un par commande, publié immédiatement, **jamais retiré** : '
  'seul son commentaire peut l''être, pour contenu illicite, et sa note '
  'continue de compter (migration 0050). Le recours d''un partenaire est la '
  'réponse publique.';
