-- =============================================================================
-- 0025 — Le nom de la demande dans la charge utile d'une décision.
--
-- L'objet du refus nomme désormais la demande concernée : « Oups ! La demande
-- « Mariage à Fidjrossè » n'est plus disponible ». Un partenaire qui a répondu
-- à trois appels d'offres dans la semaine doit savoir lequel tombe, sans
-- ouvrir le message ni se connecter.
--
-- La référence (`DEM-2026-0039`) était déjà transmise, mais elle ne dit rien à
-- qui la lit dans sa boîte : c'est un identifiant, pas un nom. Elle reste le
-- repli quand le titre manque, et le tableau du message continue de l'afficher
-- — c'est elle qu'on cite au téléphone.
--
-- Seule la charge utile change. `renderSms` ignore les champs qu'il n'utilise
-- pas : le SMS de refus, qui tient en un segment, n'est pas touché.
-- =============================================================================

create or replace function app.enqueue_quote_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cible record;
  sujet text;
  charge jsonb;
begin
  select o.phone as phone, app.org_email(new.org_id) as email,
         r.city as city, r.id as request_id,
         r.reference as reference, r.event_date as event_date,
         r.title as title
  into cible
  from public.quote_request_items i
  join public.quote_requests r on r.id = i.request_id
  join public.organizations o on o.id = new.org_id
  where i.id = new.item_id;

  sujet := case when new.status = 'accepted' then 'quote.accepted' else 'quote.declined' end;

  charge := jsonb_build_object(
    'city', cible.city,
    'requestId', cible.request_id,
    'reference', cible.reference,
    'eventDate', cible.event_date,
    'title', cible.title,
    'amount', new.subtotal,
    'currency', new.currency
  );

  if cible.phone is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('sms', cible.phone, sujet, new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  if cible.email is not null then
    insert into public.notifications (channel, recipient, kind, ref_id, payload, target_org_id)
    values ('email', cible.email, sujet, new.id, charge, new.org_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;
