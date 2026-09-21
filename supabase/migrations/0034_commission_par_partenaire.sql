-- =============================================================================
-- 0034 — Le client paie le prix affiché, et la commission se règle partenaire
--        par partenaire.
--
-- Deux décisions prises après mesure sur une vraie réservation, et non sur
-- lecture du code — c'est la mesure qui a révélé le problème.
--
-- **1. Plus aucun frais à la charge du client.** La migration 0029 ajoutait
-- 10 % au total d'une réservation immédiate. Trois défauts en découlaient :
--
-- - le client voyait une ligne « Frais de service » gonfler un prix qu'il
--   compare à un appel direct à la salle ;
-- - les frais étaient **rendus au partenaire à 90 %**, la commission portant
--   sur le total frais compris : sur 200 000 FCFA, le client payait 220 000, le
--   partenaire touchait 198 000, la plateforme gardait 22 000 — pas 40 000 ;
-- - le tunnel d'appel d'offres, lui, n'ajoutait rien. Le même partenaire au
--   même prix touchait **99 % par un chemin et 90 % par l'autre**.
--
-- Le barème n'est donc pas ramené à zéro : il est **retiré**. Un réglage à zéro
-- qu'on peut rouvrir est un piège — le jour où quelqu'un le remonte, le client
-- paie une somme que l'encart de réservation ne lui a jamais montrée, ce que
-- `CLAUDE.md` §5 interdit. Le seul revenu est désormais la commission, qui est
-- invisible au client par construction : elle se prélève sur la part du
-- partenaire, jamais au-dessus du prix.
--
-- Effet de bord bienvenu : les deux tunnels redeviennent identiques, puisque
-- aucun des deux n'ajoute plus rien au sous-total.
--
-- **2. La commission se décide partenaire par partenaire.**
-- `partner_profiles.commission_rate_override` existe depuis la migration 0002
-- et `app.commission_rate` la lit déjà. Ce qui manquait, c'est le **moyen de
-- l'écrire** : la colonne est hors du `grant update` de la migration 0021, et
-- un administrateur est lui aussi `authenticated` — un droit de colonne ne sait
-- pas les distinguer. C'est la limite décrite pour `kyc_documents` : seule une
-- fonction `SECURITY DEFINER` qui vérifie `app.is_admin()` peut trancher.
--
-- Les commandes déjà passées ne bougent pas : `orders.commission_rate` est
-- recopié à la création. Changer un taux n'engage que l'avenir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Retrait des frais acheteur
--
-- La fonction disparaît avant le réglage : laisser l'une sans l'autre donnerait
-- un repli silencieux à 10 % au premier appel oublié.
-- -----------------------------------------------------------------------------
create or replace function public.book_listing(annonce uuid, jours date[])
returns public.orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  fiche record;
  j date;
  tarif bigint;
  soustotal bigint := 0;
  taux numeric;
  nouvelle public.orders;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour réserver.' using errcode = 'insufficient_privilege';
  end if;

  if jours is null or array_length(jours, 1) is null then
    raise exception 'Choisissez au moins une date.' using errcode = 'check_violation';
  end if;

  if array_length(jours, 1) > 60 then
    raise exception 'Une réservation ne peut pas dépasser 60 jours.' using errcode = 'check_violation';
  end if;

  select l.id, l.org_id, l.title, l.status, l.is_paused, l.booking_mode, l.currency
  into fiche
  from public.listings l
  where l.id = annonce;

  if fiche.id is null then
    raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
  end if;

  if fiche.status <> 'approved' or fiche.is_paused then
    raise exception 'Cette annonce n''est pas réservable actuellement.'
      using errcode = 'check_violation';
  end if;

  if fiche.booking_mode not in ('instant', 'both') then
    raise exception 'Cette prestation se réserve sur devis.' using errcode = 'check_violation';
  end if;

  perform 1
  from public.availabilities
  where listing_id = annonce and date = any(jours)
  for update;

  foreach j in array jours loop
    tarif := app.price_for_date(annonce, j);

    if tarif is null then
      raise exception 'La date du % n''est plus disponible.', to_char(j, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;

    soustotal := soustotal + tarif;
  end loop;

  taux := app.commission_rate(fiche.org_id);

  -- **Le total est le prix affiché**, sans supplément d'aucune sorte. C'est la
  -- somme que le client a lue sur la fiche avant de cliquer, et il ne doit
  -- jamais en découvrir une autre au moment de payer.
  insert into public.orders (
    listing_id, request_id, client_id, org_id,
    total, currency, commission_rate, event_date, start_date, end_date,
    cancellation_policy_id
  )
  values (
    annonce, null, auth.uid(), fiche.org_id,
    soustotal, coalesce(fiche.currency, 'XOF'), taux,
    (select min(x) from unnest(jours) x),
    (select min(x) from unnest(jours) x),
    (select max(x) from unnest(jours) x),
    app.policy_for_listing(annonce)
  )
  returning * into nouvelle;

  update public.availabilities
  set capacity_used = capacity_used + 1,
      status = case when capacity_used + 1 >= inventory then 'booked'::public.availability_status
                    else status end,
      updated_at = now()
  where listing_id = annonce and date = any(jours);

  perform app.build_instalments(nouvelle.id);

  perform app.log_event('order', nouvelle.id, 'book', null, 'pending_payment',
    jsonb_build_object('listing_id', annonce, 'jours', array_length(jours, 1),
                       'soustotal', soustotal));

  return nouvelle;
end;
$$;

revoke execute on function public.book_listing(uuid, date[]) from public, anon;
grant execute on function public.book_listing(uuid, date[]) to authenticated;

drop function if exists app.service_fee_rate();
delete from app.runtime_config where key = 'service_fee_rate';

-- -----------------------------------------------------------------------------
-- Barème par défaut, pour les partenaires sans taux propre
--
-- ⚠️ `audit_logs.entity_id` devient annulable. Un réglage qui vaut pour toute
-- la plateforme ne porte sur **aucune ligne** : jusqu'ici, toutes les
-- transitions journalisées visaient un devis, une commande, un versement. La
-- seule alternative aurait été de ne pas journaliser le changement de barème —
-- c'est-à-dire de laisser la décision la plus lourde du produit sans trace.
-- L'index reste utilisable : Postgres y range les `null` sans se plaindre.
-- -----------------------------------------------------------------------------
alter table audit_logs alter column entity_id drop not null;

comment on column audit_logs.entity_id is
  'Ligne concernée. Nul pour un réglage valable sur toute la plateforme, '
  'comme le barème de commission général.';

create or replace function public.set_default_commission_rate(taux numeric)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ancien numeric;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  if taux is null or taux < 0 or taux > 100 then
    raise exception 'Un taux de commission se situe entre 0 et 100.' using errcode = 'check_violation';
  end if;

  select c.value::numeric into ancien from app.runtime_config c
  where c.key = 'commission_rate_default';

  insert into app.runtime_config (key, value)
  values ('commission_rate_default', taux::text)
  on conflict (key) do update set value = excluded.value;

  perform app.log_event('commission', null, 'set_default', ancien::text, taux::text,
    jsonb_build_object('taux', taux));

  return taux;
end;
$$;

revoke execute on function public.set_default_commission_rate(numeric) from public, anon;
grant execute on function public.set_default_commission_rate(numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Taux propre à un partenaire
--
-- `null` remet le partenaire au barème par défaut — ce n'est pas la même chose
-- qu'un taux de zéro, et l'écran doit pouvoir exprimer les deux.
--
-- ⚠️ Une fonction `SECURITY DEFINER` est **indispensable** ici, et non un
-- simple `grant` : la migration 0021 a retiré `commission_rate_override` des
-- colonnes écrivables par `authenticated`, et un administrateur est lui aussi
-- `authenticated`. Un droit de colonne ne sait pas distinguer les deux ; seul
-- `app.is_admin()` le peut.
-- -----------------------------------------------------------------------------
create or replace function public.set_commission_rate(org uuid, taux numeric default null)
returns public.partner_profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ligne public.partner_profiles;
  ancien numeric;
begin
  if not app.is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = 'insufficient_privilege';
  end if;

  if taux is not null and (taux < 0 or taux > 100) then
    raise exception 'Un taux de commission se situe entre 0 et 100.' using errcode = 'check_violation';
  end if;

  select p.commission_rate_override into ancien
  from public.partner_profiles p where p.org_id = org;

  update public.partner_profiles
  set commission_rate_override = taux, updated_at = now()
  where org_id = org
  returning * into ligne;

  -- Un `update` bloqué ne lève aucune erreur : il touche zéro ligne. Sans ce
  -- contrôle, l'écran annoncerait un taux enregistré qui ne l'est pas.
  if ligne.org_id is null then
    raise exception 'Ce partenaire n''a pas de profil.' using errcode = 'no_data_found';
  end if;

  perform app.log_event('commission', org, 'set', ancien::text, taux::text,
    jsonb_build_object('org_id', org, 'taux', taux));

  return ligne;
end;
$$;

revoke execute on function public.set_commission_rate(uuid, numeric) from public, anon;
grant execute on function public.set_commission_rate(uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Lecture du barème courant, pour l'écran d'administration
--
-- `app.commission_rate` est révoquée à tout le monde (migration 0026) : elle
-- sert au calcul, pas à l'affichage. Celle-ci rend les deux valeurs séparément,
-- pour qu'un écran puisse distinguer « 12 % propre à ce partenaire » de « 10 %
-- hérités du barème général » — un taux affiché sans son origine se lit comme
-- un réglage qu'on a fait soi-même.
-- -----------------------------------------------------------------------------
create or replace function public.commission_settings()
returns table (
  org_id uuid,
  org_name text,
  city text,
  status org_status,
  is_verified boolean,
  listings_count int,
  rate_override numeric,
  effective_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    coalesce(o.brand_name, o.legal_name),
    o.city,
    o.status,
    coalesce(p.is_verified, false),
    (select count(*)::int from public.listings l where l.org_id = o.id),
    p.commission_rate_override,
    app.commission_rate(o.id)
  from public.organizations o
  left join public.partner_profiles p on p.org_id = o.id
  where o.type = 'partner'
    and app.is_admin()
  order by coalesce(o.brand_name, o.legal_name);
$$;

revoke execute on function public.commission_settings() from public, anon;
grant execute on function public.commission_settings() to authenticated;

create or replace function public.default_commission_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.is_admin() then
    coalesce((select c.value::numeric from app.runtime_config c
              where c.key = 'commission_rate_default'), 10)
  end;
$$;

revoke execute on function public.default_commission_rate() from public, anon;
grant execute on function public.default_commission_rate() to authenticated;
