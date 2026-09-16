-- =============================================================================
-- 0020 — La sonnerie visait un chemin qui n'existe pas.
--
-- `create extension pg_net with schema extensions` enregistre bien l'extension
-- dans `extensions`, mais **pg_net crée son propre schéma `net`** et y pose ses
-- fonctions. L'appel `extensions.net.http_post(...)` de la migration 0019 ne
-- désignait donc rien : la bonne adresse est `net.http_post(...)`.
--
-- Le défaut était invisible pour une mauvaise raison : le gestionnaire
-- `exception when others then return null` avalait l'erreur sans un mot. Il est
-- là pour que la publication d'une demande ne puisse jamais échouer à cause
-- d'une sonnerie — c'est toujours souhaitable — mais il doit **le dire**. Un
-- `raise warning` laisse une trace dans le journal Postgres sans rien casser.
-- =============================================================================

create or replace function app.ping_notification_drain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  select value into url from app.runtime_config where key = 'notify_url';
  select value into secret from app.runtime_config where key = 'notify_secret';

  if url is null or url = '' or secret is null or secret = '' then
    return null;
  end if;

  perform net.http_post(
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
    -- Jamais d'échec de publication à cause d'une notification : la ligne est
    -- en file, le filet de sécurité la reprendra. Mais on laisse une trace,
    -- faute de quoi une sonnerie muette peut durer des mois sans qu'on le voie.
    raise warning 'Sonnerie de notification impossible : % (%)', sqlerrm, sqlstate;
    return null;
end;
$$;
