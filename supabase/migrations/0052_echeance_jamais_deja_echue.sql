-- =============================================================================
-- 0052 — Une échéance ne naît jamais déjà échue.
--
-- Constaté en production le 21 octobre 2026, sur CMD-202610-000141 : un devis
-- accepté la veille pour un événement du **22 octobre**, chez un partenaire dont
-- les conditions disent « solde 7 jours avant ». L'échéancier posé par
-- `app.build_instalments` donnait :
--
--     Réservation   150 FCFA   à régler maintenant
--     Solde         350 FCFA   à régler le 16 octobre 2026
--
-- Une date de règlement **dans le passé**, affichée le jour de la réservation.
-- Le client lit cela comme un produit cassé, et il a raison : on ne peut pas lui
-- demander de payer un jour qui n'existe plus. Pire, `start_payment` impose
-- l'ordre des échéances : il aurait réglé 150 F, puis se serait retrouvé devant
-- un solde « en retard » dès la seconde suivante.
--
-- Le défaut est **à la naissance**, pas dans l'affichage : `event_date -
-- days_before` n'était jamais confronté au jour de la réservation. Une échéance
-- qui devient tardive **ensuite** est un vrai retard de paiement, que l'écran
-- affiche déjà correctement — ce n'est pas ce qu'on corrige ici.
--
-- **La règle, décidée par l'exploitant : ce qui est déjà dû à la réservation est
-- dû à la réservation.** Toutes les échéances dont le jour est atteint ou passé
-- sont fondues en une seule, à régler tout de suite. Quand il ne reste rien
-- après elles — le cas d'un événement imminent — cela donne un **paiement
-- intégral**, ce qui est aussi la seule façon honnête de tenir la prestation :
-- l'argent doit être là avant l'événement, et l'événement est demain.
--
-- Ce qui ne change pas : un pourcentage porte sur le total, un montant fixe est
-- plafonné au reste, le solde vaut ce qui reste et n'est jamais calculé. La
-- fusion ne fait qu'**additionner** des montants déjà arrêtés — la somme des
-- échéances reste exactement le total, par construction.
--
-- `src/lib/fees.ts` (`resolveSchedule`) double cette fonction et porte la même
-- règle ; `tests/rls-echeanciers.test.ts` l'éprouve en base, `tests/fees.test.ts`
-- côté interface.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Construction des échéances d'une commande
-- -----------------------------------------------------------------------------
create or replace function app.build_instalments(cmd uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  commande public.orders;
  ligne record;
  reste bigint;
  montant bigint;
  echeance date;

  -- Ce qui est exigible dès la réservation, fondu en une seule échéance.
  du_maintenant bigint := 0;
  libelle_maintenant text;
  fusionnees int := 0;

  -- Les échéances encore à venir, dans l'ordre, avant insertion. On les tient
  -- de côté plutôt que de les écrire au fil de l'eau : les positions ne sont
  -- connues qu'à la fin, et renuméroter sous une contrainte d'unicité est un
  -- piège qu'on s'épargne.
  a_venir jsonb := '[]'::jsonb;
  dernier int;
begin
  select * into commande from public.orders where id = cmd;
  if commande.id is null then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;

  reste := commande.total;

  for ligne in
    select * from public.payment_schedules where org_id = commande.org_id order by position
  loop
    montant := case ligne.amount_kind
      when 'percent' then round(commande.total::numeric * ligne.percent / 100)::bigint
      when 'fixed' then ligne.fixed_amount
      else reste
    end;

    -- Un montant fixe supérieur à ce qui reste ne doit pas rendre l'échéancier
    -- plus cher que la commande : il est ramené au reste.
    if montant > reste then montant := reste; end if;
    if montant <= 0 then continue; end if;

    echeance := case
      when ligne.trigger = 'booking' then current_date
      when commande.event_date is null then null
      else commande.event_date - ligne.days_before
    end;

    reste := reste - montant;

    -- ⚠️ Le cœur de la correction. Une échéance dont le jour est déjà atteint
    -- rejoint ce qui est dû maintenant. Une date inconnue (événement souple)
    -- n'est pas une date passée : elle reste en attente.
    if echeance is not null and echeance <= current_date then
      du_maintenant := du_maintenant + montant;
      libelle_maintenant := coalesce(libelle_maintenant, ligne.label);
      fusionnees := fusionnees + 1;
    else
      a_venir := a_venir || jsonb_build_object(
        'label', ligne.label,
        'amount', montant,
        'due_date', echeance
      );
    end if;
  end loop;

  -- Filet : un échéancier sans solde peut ne pas tout distribuer. Le reliquat
  -- rejoint la dernière échéance plutôt que de disparaître — et s'il n'y a
  -- aucune échéance à venir, il rejoint ce qui est dû maintenant. C'est aussi
  -- ce qui couvre l'échéancier vide : une commande reste toujours réglable.
  if reste > 0 then
    dernier := jsonb_array_length(a_venir) - 1;

    if dernier >= 0 then
      a_venir := jsonb_set(
        a_venir,
        array[dernier::text, 'amount'],
        to_jsonb((a_venir -> dernier ->> 'amount')::bigint + reste)
      );
    else
      du_maintenant := du_maintenant + reste;
    end if;

    reste := 0;
  end if;

  if du_maintenant > 0 then
    insert into public.order_instalments (order_id, position, label, amount, due_date)
    values (
      cmd,
      0,
      case
        -- Aucun libellé de partenaire à reprendre (échéancier vide), ou
        -- plusieurs échéances fondues qui couvrent tout : le client règle la
        -- totalité, et l'écran doit le dire avec ce mot-là. Une seule ligne
        -- garde en revanche le libellé choisi par le partenaire — ce n'est pas
        -- à une migration de renommer ses conditions.
        when libelle_maintenant is null
          or (fusionnees > 1 and du_maintenant = commande.total) then 'Paiement intégral'
        else libelle_maintenant
      end,
      du_maintenant,
      current_date
    );
  end if;

  insert into public.order_instalments (order_id, position, label, amount, due_date)
  select
    cmd,
    (case when du_maintenant > 0 then rang else rang - 1 end)::smallint,
    e ->> 'label',
    (e ->> 'amount')::bigint,
    nullif(e ->> 'due_date', '')::date
  from jsonb_array_elements(a_venir) with ordinality as t(e, rang);
end;
$$;

revoke execute on function app.build_instalments(uuid) from public, anon, authenticated;

comment on function app.build_instalments(uuid) is
  'Échéancier figé d''une commande. Ce qui est déjà exigible le jour de la réservation est fondu en une seule échéance, due immédiatement.';

-- -----------------------------------------------------------------------------
-- Les commandes déjà nées de travers
--
-- Corriger la fonction ne répare pas ce qu'elle a produit. Une seule commande
-- vivante est dans ce cas au moment de cette migration (CMD-202610-000141), mais
-- la réparation est écrite pour le cas général plutôt que pour celle-là.
--
-- Trois garde-fous, parce qu'on touche à des lignes qui portent de l'argent :
--
-- - on ne répare qu'une commande **dont rien n'a encore été encaissé ni même
--   ouvert** — un règlement en cours de confirmation garde son montant propre
--   (`payments.amount`), et changer l'échéance sous lui ferait solder une
--   échéance de 500 F avec 150 F constatés ;
-- - on ne supprime jamais une échéance qu'un paiement désigne : la clé
--   étrangère est en `on delete restrict`, et le registre des paiements ne se
--   réécrit pas ;
-- - on ne fusionne que ce qui était **déjà échu à la naissance de la commande**
--   (`due_date <= created_at`). Un solde devenu tardif depuis est un retard de
--   paiement réel, pas un défaut de construction, et le forcer en paiement
--   intégral serait changer les conditions sous les pieds du client.
-- -----------------------------------------------------------------------------
do $$
declare
  o record;
  du_maintenant bigint;
  n int;
begin
  for o in
    select ord.id, ord.total, ord.reference
    from public.orders ord
    where ord.status = 'pending_payment'
      -- Née avec une échéance postérieure à la première déjà dépassée.
      and exists (
        select 1 from public.order_instalments i
        where i.order_id = ord.id
          and i.position > 0
          and i.due_date is not null
          and i.due_date <= ord.created_at::date
      )
      -- La première échéance est bien celle de la réservation, donc exigible :
      -- c'est elle qui recevra la fusion.
      and exists (
        select 1 from public.order_instalments i
        where i.order_id = ord.id
          and i.position = 0
          and i.due_date is not null
          and i.due_date <= current_date
      )
      and not exists (
        select 1 from public.payments p
        where p.order_id = ord.id and p.status in ('pending', 'paid')
      )
      and not exists (
        select 1 from public.payments p
        join public.order_instalments i on i.id = p.instalment_id
        where p.order_id = ord.id and i.position > 0
      )
  loop
    select coalesce(sum(i.amount), 0), count(*)
      into du_maintenant, n
      from public.order_instalments i
     where i.order_id = o.id
       and i.due_date is not null
       and i.due_date <= current_date;

    continue when n < 2;

    delete from public.order_instalments
     where order_id = o.id
       and position > 0
       and due_date is not null
       and due_date <= current_date;

    update public.order_instalments
       set amount = du_maintenant,
           due_date = current_date,
           label = case when du_maintenant = o.total then 'Paiement intégral' else label end
     where order_id = o.id and position = 0;

    -- Renumérotation des survivantes. En deux temps : la contrainte
    -- `unique (order_id, position)` n'est pas différée, et descendre 3 vers 2
    -- pendant que 2 existe encore lèverait selon l'ordre des lignes.
    update public.order_instalments
       set position = position + 100
     where order_id = o.id and position > 0;

    with ordonnees as (
      select id, row_number() over (order by position) as rang
        from public.order_instalments
       where order_id = o.id and position > 0
    )
    update public.order_instalments i
       set position = ordonnees.rang::smallint
      from ordonnees
     where i.id = ordonnees.id;

    perform app.log_event(
      'order', o.id, 'instalments_merged', null, null,
      jsonb_build_object(
        'motif', 'echeances_nees_echues',
        'fusionnees', n,
        'du_maintenant', du_maintenant,
        'reference', o.reference
      )
    );
  end loop;
end
$$;
