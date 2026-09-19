-- =============================================================================
-- 0027 — Rattacher la transaction du prestataire au paiement.
--
-- `start_payment` ouvre la ligne, puis l'application appelle FedaPay et reçoit
-- un identifiant de transaction. Il faut l'inscrire — mais `payments` n'a
-- **aucune politique d'écriture**, et c'est voulu : un client qui pourrait
-- toucher à cette table pourrait s'y déclarer payé.
--
-- D'où cette fonction, aussi étroite que possible : elle n'écrit que la
-- référence du prestataire, uniquement sur un paiement encore en attente, et
-- uniquement pour le client à qui la commande appartient. Elle ne peut pas
-- changer un montant, ni un état.
-- =============================================================================

create or replace function public.attach_payment_reference(cle text, ref text, adresse text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  proprio uuid;
  etat public.payment_status;
begin
  select o.client_id, p.status
  into proprio, etat
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.idempotency_key = cle;

  if proprio is null then
    raise exception 'Paiement introuvable.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER contourne la RLS : l'autorisation se vérifie donc ici.
  if proprio <> auth.uid() then
    raise exception 'Ce paiement ne vous appartient pas.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Un paiement déjà dénoué ne se réattache pas : ce serait le chemin par
  -- lequel on ferait pointer un encaissement vers une autre transaction.
  if etat <> 'pending' then
    raise exception 'Ce paiement n''est plus en attente.' using errcode = 'check_violation';
  end if;

  update public.payments
  set provider_ref = ref,
      -- L'adresse de la page sert deux fois : à renvoyer un client qui a fermé
      -- son onglet, plutôt que d'ouvrir une seconde transaction, et au support
      -- pour savoir où l'on avait envoyé quelqu'un.
      payload = case
        when adresse is null then payload
        else payload || jsonb_build_object('url', adresse)
      end,
      updated_at = now()
  where idempotency_key = cle;
end;
$$;

revoke execute on function public.attach_payment_reference(text, text, text) from public, anon;
grant execute on function public.attach_payment_reference(text, text, text) to authenticated;

comment on function public.attach_payment_reference(text, text, text) is
  'Inscrit l''identifiant de transaction du prestataire sur un paiement en attente.';
