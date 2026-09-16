-- =============================================================================
-- 0017 — Numéros de téléphone sous forme canonique.
--
-- La colonne `phone` accueillait jusqu'ici deux formes différentes :
--
--   organizations   « +229 01 94 00 00 06 »   forme d'affichage, avec espaces
--   profiles        « +2290197000012 »        E.164, exploitable
--
-- L'application normalise pourtant à l'écriture (`normaliseBeninPhone`) ; c'est
-- le jeu de démonstration qui insérait la forme lisible. Rien ne l'en empêchait,
-- faute de contrainte.
--
-- Ce n'était sans conséquence que tant que personne ne s'en servait. Une
-- passerelle SMS, elle, rejette « +229 01 94 00 00 06 » : six des sept
-- organisations renseignées seraient devenues injoignables, sans erreur visible
-- ailleurs que dans les journaux d'envoi.
--
-- On normalise l'existant, puis on interdit le retour en arrière.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Forme canonique
--
-- E.164 et rien d'autre : un « + », puis des chiffres. La règle reste
-- **agnostique du pays** — le schéma est multi-pays (`organizations.country`),
-- et une contrainte béninoise interdirait d'ouvrir un voisin sans migration.
-- -----------------------------------------------------------------------------
create or replace function app.canonical_phone(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null then null
    when btrim(value) = '' then null
    -- Retire tout ce qui n'est pas un chiffre, puis le préfixe international
    -- « 00 » que certaines saisies portent à la place du « + ».
    else '+' || regexp_replace(regexp_replace(value, '\D', '', 'g'), '^00', '')
  end
$$;

comment on function app.canonical_phone(text) is
  'Numéro au format E.164. Miroir SQL de normaliseBeninPhone, pour les données déjà en base.';

-- -----------------------------------------------------------------------------
-- Reprise de l'existant
-- -----------------------------------------------------------------------------
update public.organizations
set phone = app.canonical_phone(phone)
where phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$';

update public.profiles
set phone = app.canonical_phone(phone)
where phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$';

update public.quote_requests
set contact_phone = app.canonical_phone(contact_phone)
where contact_phone is not null and contact_phone !~ '^\+[1-9][0-9]{7,14}$';

-- Une saisie trop abîmée pour être redressée (trop courte, vide de chiffres)
-- vaut mieux absente que fausse : un SMS à un numéro inventé est facturé.
update public.organizations set phone = null where phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$';
update public.profiles set phone = null where phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$';
update public.quote_requests set contact_phone = null where contact_phone is not null and contact_phone !~ '^\+[1-9][0-9]{7,14}$';

-- -----------------------------------------------------------------------------
-- Interdiction du retour en arrière
--
-- 8 à 15 chiffres après le « + » : c'est la fourchette que définit E.164, et
-- elle laisse passer tous les pays. Le premier chiffre ne peut être un zéro.
-- -----------------------------------------------------------------------------
alter table public.organizations
  drop constraint if exists organizations_phone_e164,
  add constraint organizations_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.profiles
  drop constraint if exists profiles_phone_e164,
  add constraint profiles_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.quote_requests
  drop constraint if exists quote_requests_contact_phone_e164,
  add constraint quote_requests_contact_phone_e164
    check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
