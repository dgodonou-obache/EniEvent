-- =============================================================================
-- 0051 — Le catalogue fictif n'est plus payable
--
-- **Le défaut le plus coûteux ouvert aujourd'hui, et le moins visible.** Depuis
-- le passage de FedaPay en argent réel, sept annonces du jeu de démonstration
-- portaient `booking_mode` à `instant` ou `both`. Trois avaient des dates
-- ouvertes au tarif du jour :
--
--   Villa Atlantique (Ouidah)               300 000 F · 450 000 F le week-end
--   Paillote de Grand-Popo                  180 000 F · 252 000 F le week-end
--   Pack sonorisation & lumière 300 pers.   120 000 F · 144 000 F le week-end
--
-- ⚠️ **Ces lieux n'existent pas.** Les six organisations du jeu de
-- démonstration n'ont aucun membre : personne ne pouvait honorer la prestation,
-- personne n'aurait vu la commande arriver, et le client aurait payé pour une
-- villa inventée. Rien dans le code ne s'y opposait, et c'est le point : du
-- point de vue de `book_listing`, tout était en règle — annonce publiée, date
-- ouverte, tarif renseigné, barème d'annulation présent.
--
-- Les quatre autres n'avaient pas de dates ouvertes **ce jour-là**, ce qui ne
-- les rendait pas sûres : le seed ouvre six mois de dates à chaque
-- `npm run demo:reset`. Toutes les sept sont donc traitées.
--
-- -----------------------------------------------------------------------------
-- Pourquoi `quote` plutôt qu'une mise en pause ou un effacement
-- -----------------------------------------------------------------------------
--
-- `is_paused` les ferait disparaître du catalogue : on perdrait la vitrine, qui
-- sert à montrer le produit, et le site serait vide. Les effacer coûterait les
-- photos, les tarifs et les disponibilités, c'est-à-dire tout ce que le jeu de
-- démonstration apporte.
--
-- `quote` ne retire que **le chemin vers l'argent** : `book_listing` lève
-- « Cette prestation se réserve sur devis » (0032), et c'est la fonction qui le
-- dit, pas un écran. Une demande de devis reste possible, et elle n'engage
-- aucun franc.
--
-- ⚠️ **Cette migration seule ne suffit pas, et c'est l'essentiel à comprendre.**
-- Elle corrige les lignes présentes ; `supabase/seed.sql` les recréerait en
-- `instant` au prochain `demo:reset`. Le seed a donc été changé dans le même
-- commit, et `tests/seed.test.ts` refuse désormais le retour de ces valeurs.
-- Une correction que le prochain `demo:reset` défait n'est pas une correction.
--
-- Rien ici ne vise les annonces d'un vrai partenaire : la mise à jour est
-- bornée aux six organisations du jeu de démonstration, nommément.
-- =============================================================================

update public.listings l
set booking_mode = 'quote'
from public.organizations o
where o.id = l.org_id
  and l.booking_mode <> 'quote'
  and o.slug in (
    'espaces-cotonou',
    'saveurs-du-benin',
    'decor-ahossi',
    'residences-ouidah',
    'sono-calavi',
    'ceremonies-golfe'
  );

comment on column public.listings.booking_mode is
  'Tunnel de réservation. ⚠️ `instant` ou `both` ouvre un encaissement réel : '
  'une annonce qui ne correspond à aucune prestation honorable ne doit jamais '
  'les porter. Les annonces du jeu de démonstration sont toutes sur devis '
  'depuis la migration 0051.';
