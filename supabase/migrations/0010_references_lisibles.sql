-- =============================================================================
-- 0010 — Références lisibles : valeur par défaut plutôt que déclencheur.
--
-- La migration 0009 remplissait `reference` par un déclencheur BEFORE INSERT,
-- parce que `app.generate_reference` vit dans un schéma révoqué au public :
-- l'utiliser comme DEFAULT échouerait sur « permission denied for sequence ».
--
-- Ce contournement a un coût inattendu : une colonne `not null` sans DEFAULT est
-- déclarée **obligatoire à l'insertion** par le générateur de types Supabase,
-- qui ne connaît pas les déclencheurs. Le code applicatif ne compilait donc plus
-- sans fournir une référence — exactement ce qu'on voulait lui interdire.
--
-- La bonne réponse n'est pas d'ouvrir le schéma `app` aux utilisateurs : ses
-- fonctions sont des helpers `SECURITY DEFINER`, et y donner accès permettrait
-- par exemple d'écrire directement dans le journal d'audit. On expose donc une
-- seule fonction, dans `public`, qui ne sait faire que cela.
-- =============================================================================

create or replace function public.next_reference(prefix text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select app.generate_reference(prefix)
$$;

comment on function public.next_reference is
  'Référence lisible et triable (DEM-202609-000042). Exposée parce qu''une '
  'valeur par défaut s''évalue avec les droits de l''appelant. Sans effet de '
  'bord : au pire, un appel direct consomme un numéro de séquence.';

grant execute on function public.next_reference(text) to authenticated;

alter table quote_requests
  alter column reference set default public.next_reference('DEM');

alter table quotes
  alter column reference set default public.next_reference('DEV');

-- Le déclencheur des demandes n'a plus d'objet.
drop trigger if exists quote_requests_reference on quote_requests;
drop function if exists app.set_quote_request_reference();

-- Celui des devis garde sa seconde raison d'être : aligner `org_type` sur
-- l'organisation visée, pour que la clé étrangère composite tienne sans que
-- l'appelant ait à connaître — ni pouvoir mentir sur — le type.
create or replace function app.set_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select o.type into new.org_type
  from public.organizations o
  where o.id = new.org_id;

  if new.org_type is null then
    raise exception 'Organisation % introuvable', new.org_id;
  end if;

  return new;
end;
$$;
