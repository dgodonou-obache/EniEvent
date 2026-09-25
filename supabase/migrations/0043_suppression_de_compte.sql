-- =============================================================================
-- 0043 — Supprimer son compte
--
-- Rien ne permettait de partir. Trois contraintes `on delete restrict` —
-- `orders.client_id`, `refunds.client_id`, `messages.sender_id` — bloquaient
-- une suppression manuelle, mais **par accident** : le résultat était une
-- erreur Postgres brute, pas un refus expliqué.
--
-- ⚠️ **Et pour un compte sans commande, la suppression passait et détruisait
-- le travail d'autrui.** La chaîne est en cascade :
--
--     profiles → quote_requests → quote_request_items → quotes
--
-- Supprimer un client effaçait donc **les devis que ses partenaires avaient
-- chiffrés**. Même chose pour `conversations` : le fil disparaissait des deux
-- côtés, et le prestataire perdait la trace de ce qui avait été convenu. Ces
-- lignes ne lui appartiennent pas.
--
-- D'où **deux régimes**, et non un :
--
--   • aucune histoire (ni commande, ni devis, ni message) → **effacement réel**
--   • une histoire existe                                 → **anonymisation**
--
-- Une commande réglée est une pièce comptable : elle doit survivre, pour la
-- plateforme comme pour le partenaire, qui en a autant besoin. On efface donc
-- ce qui identifie la personne, jamais ce qui prouve la transaction.
--
-- Dans les deux cas le compte devient inutilisable et l'adresse est libérée :
-- un réinscrit repart d'une page blanche, sans lien avec l'ancien compte.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Marquer un profil anonymisé
--
-- Sans cette colonne, un écran affichant « Sans nom » ne saurait pas distinguer
-- quelqu'un qui n'a pas rempli son profil de quelqu'un qui est parti.
-- -----------------------------------------------------------------------------

alter table profiles add column if not exists deleted_at timestamptz;

comment on column profiles.deleted_at is
  'Horodatage de la suppression du compte. La ligne survit parce que des pièces '
  'comptables la référencent ; son contenu identifiant, lui, est effacé.';

-- ⚠️ Colonne de privilège : elle décide si un compte est mort. Personne ne
-- l'écrit directement — `delete_my_account` s'en charge (§3 du guide).
revoke update (deleted_at) on profiles from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ce qui empêche de partir
-- -----------------------------------------------------------------------------

/**
 * Les raisons, en clair, pour lesquelles ce compte ne peut pas être supprimé.
 *
 * ⚠️ **Cette fonction ne décide rien** : elle sert à l'écran, pour dire
 * *avant* le geste ce qui coince et comment le débloquer. `delete_my_account`
 * refait tous les contrôles pour son propre compte — un écran qui ne montre
 * pas de blocage n'est pas une autorisation.
 *
 * L'ordre est celui de l'urgence : l'argent d'abord, l'organisation ensuite.
 */
create or replace function public.account_deletion_blockers()
returns table (code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  mes_orgs uuid[];
  n integer;
  somme bigint;
begin
  if moi is null then
    raise exception 'Connectez-vous.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(o), '{}') into mes_orgs from app.user_org_ids() as o;

  -- ---------------------------------------------------------------------------
  -- 1. Réservations en cours, comme client
  --
  -- « En cours » recouvre deux choses distinctes : de l'argent encore dû
  -- (`pending_payment`, `deposit_paid`), et une prestation pas encore rendue.
  -- Une commande réglée dont l'événement est passé n'est plus un encours —
  -- c'est de l'histoire, et elle n'empêche pas de partir.
  -- ---------------------------------------------------------------------------
  select count(*) into n
  from public.orders o
  where o.client_id = moi
    and (
      o.status in ('pending_payment', 'deposit_paid')
      or (o.status = 'paid' and coalesce(o.end_date, o.event_date) >= current_date)
    );

  if n > 0 then
    return query select
      'commandes_client',
      format('Vous avez %s réservation%s en cours. Attendez la prestation, ou annulez-la avant de partir.',
             n, case when n > 1 then 's' else '' end);
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. Réservations reçues, comme prestataire
  --
  -- Un partenaire qui disparaît la veille d'un mariage laisse un client sans
  -- salle et sans interlocuteur.
  -- ---------------------------------------------------------------------------
  if array_length(mes_orgs, 1) > 0 then
    select count(*) into n
    from public.orders o
    where o.org_id = any(mes_orgs)
      and (
        o.status in ('pending_payment', 'deposit_paid')
        or (o.status = 'paid' and coalesce(o.end_date, o.event_date) >= current_date)
      );

    if n > 0 then
      return query select
        'commandes_partenaire',
        format('Votre structure a %s réservation%s à honorer. Elles doivent être assurées ou annulées avant.',
               n, case when n > 1 then 's' else '' end);
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. Argent que la plateforme doit
  --
  -- Le blocage le moins intuitif, et le plus important : sans lui, quelqu'un
  -- part et on ne sait plus à qui envoyer son argent.
  -- ---------------------------------------------------------------------------
  select count(*) into n
  from public.refunds r
  where r.client_id = moi and r.status = 'pending';

  if n > 0 then
    return query select
      'remboursement_du',
      'Un remboursement vous est dû et n''a pas encore été envoyé. Nous devons pouvoir vous joindre jusque-là.';
  end if;

  if array_length(mes_orgs, 1) > 0 then
    select coalesce(sum(p.payable), 0) into somme
    from unnest(mes_orgs) as org, lateral public.pending_payout_amount(org) as p;

    if somme > 0 then
      return query select
        'versement_du',
        'Un versement vous est dû et n''a pas encore été envoyé. Nous devons pouvoir vous joindre jusque-là.';
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. Négociations en cours
  --
  -- Partir au milieu d'un appel d'offres laisse l'autre partie avec des offres
  -- que personne n'honorera.
  -- ---------------------------------------------------------------------------
  select count(*) into n
  from public.quote_requests q
  where q.requester_id = moi and q.status = 'open';

  if n > 0 then
    return query select
      'demandes_ouvertes',
      format('Vous avez %s demande%s de devis ouverte%s. Clôturez-la%s avant de partir.',
             n, case when n > 1 then 's' else '' end,
             case when n > 1 then 's' else '' end,
             case when n > 1 then 's' else '' end);
  end if;

  if array_length(mes_orgs, 1) > 0 then
    select count(*) into n
    from public.quotes q
    where q.org_id = any(mes_orgs) and q.status = 'sent';

    if n > 0 then
      return query select
        'devis_en_attente',
        format('Vous avez %s devis en attente de réponse. Retirez-le%s ou attendez la décision du client.',
               n, case when n > 1 then 's' else '' end);
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 5. Engagements d'entreprise en attente d'aval
  --
  -- Un valideur qui s'en va laisse les demandes bloquées sans que personne ne
  -- comprenne pourquoi — c'est le défaut que `/entreprise/equipe` signale déjà.
  -- ---------------------------------------------------------------------------
  if array_length(mes_orgs, 1) > 0 then
    select count(*) into n
    from public.approvals a
    where a.org_id = any(mes_orgs) and a.status = 'pending';

    if n > 0 then
      return query select
        'avals_en_attente',
        format('%s engagement%s attend%s un aval dans votre entreprise. Tranchez-le%s, ou confiez le rôle à quelqu''un d''autre.',
               n, case when n > 1 then 's' else '' end,
               case when n > 1 then 'ent' else '' end,
               case when n > 1 then 's' else '' end);
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 6. Dernier dirigeant d'une structure qui a vécu
  --
  -- ⚠️ Supprimer un compte ne supprime pas l'organisation. Laisser partir son
  -- dernier dirigeant la laisserait sans personne aux commandes, avec des
  -- annonces en ligne et des clients qui réservent.
  --
  -- Une structure **sans aucune activité** fait exception : c'est le cas de
  -- l'inscription faite par erreur, qui sera fréquent au début. Elle part avec
  -- son fondateur plutôt que de le retenir à vie.
  -- ---------------------------------------------------------------------------
  return query
  select
    'dernier_dirigeant',
    format('Vous êtes seul aux commandes de « %s ». Transmettez la propriété à quelqu''un d''autre avant de partir.',
           coalesce(o.brand_name, o.legal_name))
  from public.organizations o
  join public.organization_members m
    on m.org_id = o.id and m.user_id = moi and m.status = 'active'
  where m.role in ('owner', 'admin')
    -- Personne d'autre ne peut prendre la suite.
    and not exists (
      select 1 from public.organization_members autre
      where autre.org_id = o.id
        and autre.user_id <> moi
        and autre.status = 'active'
        and autre.role in ('owner', 'admin')
    )
    -- Et la structure a vécu : annonces, commandes ou devis.
    and (
      exists (select 1 from public.listings l where l.org_id = o.id)
      or exists (select 1 from public.orders c where c.org_id = o.id)
      or exists (select 1 from public.quotes q where q.org_id = o.id)
    );
end;
$$;

revoke execute on function public.account_deletion_blockers() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;

-- -----------------------------------------------------------------------------
-- Partir
-- -----------------------------------------------------------------------------

/**
 * Supprimer son propre compte.
 *
 * ⚠️ **Refait tous les contrôles.** L'écran affiche les blocages, mais un
 * écran n'est pas une autorisation : la personne a pu ouvrir la page hier, et
 * réserver depuis un autre onglet.
 *
 * ⚠️ **On ne supprime jamais le compte de quelqu'un d'autre.** La fonction ne
 * prend aucun paramètre : elle agit sur `auth.uid()`, et rien d'autre. Un
 * identifiant en argument aurait été une porte à garder.
 *
 * Rend le régime appliqué — `'efface'` ou `'anonymise'` — pour que l'écran
 * dise la vérité sur ce qui vient de se passer.
 */
create or replace function public.delete_my_account()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi uuid := auth.uid();
  blocage text;
  historique boolean;
  mes_orgs uuid[];
  regime text;
begin
  if moi is null then
    raise exception 'Connectez-vous.' using errcode = 'insufficient_privilege';
  end if;

  select b.reason into blocage from public.account_deletion_blockers() b limit 1;

  if blocage is not null then
    raise exception '%', blocage using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(o), '{}') into mes_orgs from app.user_org_ids() as o;

  -- ---------------------------------------------------------------------------
  -- Le régime : y a-t-il une histoire à préserver ?
  --
  -- « Histoire » ne veut pas dire « traces de mon passage » mais **données que
  -- d'autres ont produites ou dont d'autres ont besoin** : une commande, un
  -- message reçu par quelqu'un, un devis chiffré par un partenaire.
  -- ---------------------------------------------------------------------------
  select
    exists (select 1 from public.orders o where o.client_id = moi)
    or exists (select 1 from public.messages m where m.sender_id = moi)
    or exists (
      select 1 from public.quotes q
      join public.quote_request_items i on i.id = q.item_id
      join public.quote_requests r on r.id = i.request_id
      where r.requester_id = moi
    )
    or (array_length(mes_orgs, 1) > 0 and (
      exists (select 1 from public.orders o where o.org_id = any(mes_orgs))
      or exists (select 1 from public.quotes q where q.org_id = any(mes_orgs))
    ))
  into historique;

  regime := case when historique then 'anonymise' else 'efface' end;

  -- Journalisé **avant** l'effacement : après, `auth.uid()` n'aurait plus de
  -- ligne à référencer, et `app.log_event` écrit `actor_id`.
  perform app.log_event('profile', moi, 'delete_account', null, regime,
    jsonb_build_object('regime', regime));

  if historique then
    -- -------------------------------------------------------------------------
    -- Anonymisation : on efface qui, on garde quoi.
    -- -------------------------------------------------------------------------
    update public.profiles
    set full_name = null,
        phone = null,
        avatar_url = null,
        city = null,
        country = null,
        account_type = 'particulier',
        deleted_at = now(),
        updated_at = now()
    where id = moi;

    -- Le membre sort des organisations : il ne doit plus y avoir de droits.
    -- La ligne reste, en `revoked`, parce que `quotes.created_by` et les
    -- journaux y renvoient.
    update public.organization_members
    set status = 'revoked', updated_at = now()
    where user_id = moi;

    -- ⚠️ L'adresse est libérée, et remplacée par une valeur **non routable** :
    -- `.invalid` est réservé par la norme, aucun courriel ne partira jamais là.
    -- Sans cela, une relance automatique pourrait un jour écrire à quelqu'un
    -- qui a demandé à être oublié.
    update auth.users
    set email = 'supprime-' || moi::text || '@enievent.invalid',
        phone = null,
        raw_user_meta_data = '{}'::jsonb,
        encrypted_password = null,
        -- Ferme la connexion pour de bon, sans supprimer la ligne dont
        -- dépendent les pièces comptables.
        --
        -- ⚠️ **Une date lointaine, et non `'infinity'`.** Avec l'infini,
        -- l'API d'administration de Supabase cesse de rendre le compte : il
        -- disparaît de `listUsers` et du tableau de bord, alors que la ligne
        -- est bien là. Constaté en recette — et c'est exactement le genre
        -- d'écart qu'on ne découvre qu'en cherchant un compte au support, un
        -- jour où ça presse.
        banned_until = now() + interval '100 years'
    where id = moi;
  else
    -- -------------------------------------------------------------------------
    -- Effacement réel : rien ne dépend de ce compte.
    --
    -- Les cascades emportent favoris, demandes de support, appartenances et
    -- demandes de devis sans devis. Une structure sans activité part avec son
    -- fondateur — c'est l'inscription faite par erreur.
    -- -------------------------------------------------------------------------
    if array_length(mes_orgs, 1) > 0 then
      delete from public.organizations o
      where o.id = any(mes_orgs)
        and not exists (
          select 1 from public.organization_members m
          where m.org_id = o.id and m.user_id <> moi and m.status = 'active'
        );
    end if;

    delete from auth.users where id = moi;
  end if;

  return regime;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- -----------------------------------------------------------------------------
-- Un compte supprimé ne se reconnecte pas
--
-- `banned_until` ferme la porte côté Supabase Auth. Ce déclencheur ferme la
-- seconde : une session encore valide, émise avant la suppression, ne doit pas
-- permettre d'écrire quoi que ce soit.
-- -----------------------------------------------------------------------------

create or replace function app.refuse_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deleted_at is not null
  ) then
    raise exception 'Ce compte a été supprimé.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_refuse_deleted on orders;
create trigger orders_refuse_deleted
  before insert on orders
  for each row execute function app.refuse_deleted_account();

drop trigger if exists messages_refuse_deleted on messages;
create trigger messages_refuse_deleted
  before insert on messages
  for each row execute function app.refuse_deleted_account();

drop trigger if exists quote_requests_refuse_deleted on quote_requests;
create trigger quote_requests_refuse_deleted
  before insert on quote_requests
  for each row execute function app.refuse_deleted_account();
