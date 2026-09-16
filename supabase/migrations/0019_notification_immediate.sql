-- =============================================================================
-- 0019 — Notification immédiate.
--
-- La migration 0018 posait une file, vidée par une tâche planifiée. C'était
-- correct mais lent : un partenaire prévenu vingt minutes après le dépôt d'une
-- demande a déjà perdu l'affaire, et sur un forfait limité à une exécution
-- quotidienne, l'alerte n'a tout simplement plus d'objet.
--
-- **Le sondage n'est pas la bonne réponse.** Ce n'est pas au temps de décider
-- quand prévenir, c'est à l'événement. La base appelle donc elle-même la route
-- de vidage dès qu'une ligne est écrite, par `pg_net` — un appel HTTP
-- asynchrone : la transaction n'attend pas la réponse, et un partenaire reçoit
-- son SMS dans les secondes qui suivent l'action du client.
--
-- Ce que cela ne change pas : l'envoi continue de se faire dans la route, seul
-- endroit où la clé de service est admise. La base ne fait que sonner.
--
-- **Déclencheur au niveau de l'instruction, pas de la ligne.** Une demande
-- réveille jusqu'à vingt partenaires, insérés en une seule instruction : un
-- déclencheur par ligne provoquerait vingt appels HTTP pour un seul vidage.
--
-- **L'URL et le secret ne sont pas ici.** Ils vivent dans les réglages de la
-- base (`alter database ... set`), posés hors du dépôt : un secret dans une
-- migration serait un secret sur GitHub. Absents, le déclencheur ne fait rien
-- et la file reste vidée par la tâche planifiée — c'est ce qui permet aussi aux
-- tests de tourner dans un Postgres jetable, qui n'a pas `pg_net`.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

create or replace function app.ping_notification_drain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := current_setting('app.notify_url', true);
  secret text := current_setting('app.notify_secret', true);
begin
  -- Réglages absents : rien à faire. C'est le cas dans le Postgres jetable des
  -- tests, et ce doit rester silencieux — la file sera vidée autrement.
  if url is null or url = '' or secret is null or secret = '' then
    return null;
  end if;

  perform extensions.net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );

  return null;
exception
  when others then
    -- Une sonnerie ratée ne doit jamais empêcher la demande d'être publiée :
    -- la ligne est en file, la tâche planifiée la reprendra.
    return null;
end;
$$;

comment on function app.ping_notification_drain() is
  'Sonne la route de vidage dès qu''une notification est mise en file. Sans effet si app.notify_url n''est pas réglée.';

create trigger notifications_ping
  after insert on notifications
  for each statement
  execute function app.ping_notification_drain();
