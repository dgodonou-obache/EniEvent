# Où en est ÉniEvent

Ce qui est en ligne, ce qui reste, et dans quel ordre. **C'est le seul document à
lire pour savoir quoi construire ensuite.** Les plans de `~/.claude/plans/`
décrivent des lots déjà livrés et ne font plus foi.

Dernière mise à jour : 10 octobre 2026, après le lot A — Confiance. 831 tests
verts, 49 migrations, production sur https://enievent.com.

> ⚠️ **Les paiements réels sont ouverts.** Tout ce qui suit s'écrit désormais
> sur un produit qui encaisse. Voir §3.3 — le catalogue est encore fictif, et
> cette combinaison demande une décision avant toute autre chose.

---

## 1. Ce qui fonctionne aujourd'hui

La chaîne complète tient de bout en bout : **un client peut chercher, réserver,
payer, dialoguer, annuler et être remboursé** ; un partenaire peut publier,
chiffrer, encaisser et être versé ; l'administration voit passer l'argent.

| Domaine | État |
|---|---|
| Catalogue, recherche, carte, fiches annonce | En ligne |
| Double tunnel : réservation immédiate **et** appel d'offres | En ligne |
| Boucle de l'offre : publication → modération → catalogue | En ligne |
| Planning, tarifs, prix plancher | En ligne |
| Commande, échéancier, paiement FedaPay | **Bac à sable** (voir §3) |
| Annulation, barème, remboursement | En ligne, **exécution manuelle** (§3) |
| Versements aux partenaires | En ligne, **exécution manuelle** (§3) |
| Commission par partenaire, depuis `/admin/partenaires` | En ligne |
| Messagerie client ↔ prestataire, coordonnées masquées | En ligne |
| Notifications par courriel (SMS débranché) | En ligne |
| Espace entreprise : budgets, validations, équipe | En ligne |
| Back-office : comptes, référentiel, journal, rapports, interrupteurs | En ligne |
| Partenaire : équipe, invitations, pièces justificatives, statistiques, support | En ligne |
| Avis après prestation, notes, droit de réponse | En ligne |
| Signalements de contenu, litiges sur réservation | En ligne |
| Client : favoris et reçus de paiement | En ligne |
| Suppression de compte, sous conditions (client, partenaire, entreprise) | En ligne |
| Pages légales | En ligne, **à compléter** (§3) |

## 2. Le décompte des écrans

61 entrées de menu, **50 construites, 11 en attente**. Chaque entrée non
construite affiche un écran nommant son lot, jamais un 404
(`src/components/dashboard/roadmap.ts`).

| Espace | Livrés | Reste |
|---|---|---|
| Partenaire — `/pro` | 15 / 18 | 3 |
| Entreprise — `/entreprise` | 9 / 12 | 3 |
| Back-office — `/admin` | 18 / 23 | 5 |
| Particulier — `/compte` | **8 / 8** | — |

Le déséquilibre initial est résorbé : le back-office d'exploitation et la
confiance sont en place, et ce qui reste relève de la facturation, du confort et
de l'éditorial.

---

## 3. ⚠️ Ce qui bloque la commercialisation

**Aucun de ces points n'est un lot de développement.** Ils ne se règlent pas en
écrivant du code, et tant qu'ils tiennent, aucun franc réel ne peut circuler.
Par ordre de blocage :

### 3.1 ~~L'identité légale n'est pas renseignée~~ — levé le 7 octobre 2026

L'immatriculation est publiée : **Établissement**, RCCM `RB/COT/21 A 70480`,
IFU `0202112931007`, siège à Cotonou (Bénin). Les quatre pages légales
n'affichent plus aucun « à compléter », et le bandeau « document en cours de
finalisation » a disparu.

Deux choix d'exploitation, assumés, à ne pas prendre pour des oublis :

- **Pas de capital social.** Un établissement n'en a pas — son patrimoine est
  celui de son exploitant. Le champ a été retiré du modèle, pas laissé vide.
- **Ni téléphone, ni directeur de la publication**, retirés des mentions le
  7 octobre 2026. L'éditeur reste joignable par courriel, qui est publié. Les
  champs survivent dans `LegalEntity`, prêts à revenir ; les remettre demande
  d'ajouter une entrée à `publishedMentions()` **et** d'en renseigner la
  valeur — `entityIsComplete()` relit cette liste, donc l'une sans l'autre
  rallume le bandeau.

C'est exactement ce qu'un prestataire de paiement vérifie à l'ouverture d'un
compte marchand. **Le dossier FedaPay est désormais déposable** — c'est le
blocage suivant, et il ne dépend plus du code.

### 3.2 ~~Le compte marchand FedaPay n'est pas validé~~ — levé le 8 octobre 2026

Le compte est validé et la clé de production est en place. Vérifié depuis
l'extérieur, pas sur parole : la mention « Mode test » a disparu de la
production alors qu'elle persiste en local, le webhook refuse une fausse
signature en `401`, et `/api/cron/paiements` lit `"webhook":"actif"` **dans le
compte live**.

Garde-fous posés avec : `liveBlocker` refuse d'ouvrir un paiement réel sans
`FEDAPAY_WEBHOOK_SECRET`, aucune variable `NEXT_PUBLIC_` ne touche à FedaPay,
et `npm run fedapay:verifier` contrôle tout cela en lecture seule.

**Reste à mesurer** : `/payouts` et `/refunds` devraient être ouverts depuis la
validation, mais personne ne l'a constaté — le pré-vol tourne avec la clé de
bac à sable. Tant que ce n'est pas vérifié, `mark_payout_sent` et
`mark_refund_sent` restent des **registres** tenus à la main. Les transformer
en virements réels, c'est de l'argent qui sort : plafond par virement, double
validation et journal avant quoi que ce soit.

### 3.3 ⚠️ Le catalogue est fictif — et il encaisse

**C'est désormais le point le plus urgent du document**, parce que 3.2 est levé.

Mesuré le 10 octobre 2026 : **3 annonces fictives sont payables en ligne**, en
réservation immédiate, avec une date ouverte et de l'argent réel.

| Annonce | Prix | Dates ouvertes |
|---|---|---|
| Villa Atlantique (Ouidah) | 300 000 F | 74 |
| Auditorium Cadjèhoun | 250 000 F | 75 |
| Pack sonorisation & lumière 300 personnes | 120 000 F | 74 |

Un visiteur venu d'une recherche peut réserver et régler par Mobile Money une
salle qui n'existe pas. L'argent arrive sur le compte marchand, et il faut le
rembourser — or `/refunds` n'est pas encore constaté ouvert (§3.2).

Six organisations du catalogue viennent du jeu de démonstration (toutes créées
le 6 septembre 2026, numéros séquentiels `+229019X0000XX`). Trois autres —
ESDET, BÈZEALL, Essai SARL — sont des inscriptions ultérieures à trier.

**Trois issues, par ordre de douceur :**

1. **Passer les annonces de démonstration en `booking_mode = 'quote'`.** Le
   catalogue reste vivant et continue de produire des demandes de devis ; plus
   aucun paiement en ligne n'est possible. Réversible en une commande.
2. Fermer leurs disponibilités : plus de date réservable, mais les fiches
   restent.
3. Dépublier le jeu de démonstration : catalogue vide, vitrine honnête mais
   déserte.

Et dans tous les cas : **recruter de vrais partenaires**, puis retirer le jeu
de démonstration ainsi que les quatre comptes de démonstration, dont
`demo-admin`, qui est de type `admin`.

### 3.4 Secrets à faire tourner

- Ancienne clé Resend « Full access » — à révoquer.
- Trois jetons OVH — à révoquer.
- ~~`FEDAPAY_WEBHOOK_SECRET`~~ — posée le 8 octobre 2026, et désormais
  **obligatoire** en production (`liveBlocker`). Reste à confirmer, par un
  événement de test depuis le tableau de bord FedaPay, que le secret posé est
  bien celui du webhook *live* et non celui du bac à sable. Si ce n'était pas
  le cas, rien ne serait perdu — `/api/cron/paiements` dénoue les paiements
  indépendamment du webhook, sous ~20 minutes — mais l'exécution GitHub
  passerait au rouge, ce qui est le comportement voulu.

### 3.5 Deux réglages à décider

- **Le taux de commission** est à 10 % provisoire. Il se règle partenaire par
  partenaire depuis `/admin/partenaires` ; le barème général vaut pour les
  autres.
- **DMARC est en `p=none`** — observation seule, aucune sanction. Durcir en
  `p=quarantine` après quelques semaines de rapports (`docs/DEPLOIEMENT.md`
  §3 ter). Prématurément, cela met les confirmations d'inscription en
  indésirable, et le symptôme est silencieux.

---

## 4. Les quatre lots restants

Lettrés, et non numérotés : les lots 1 à 8 du plan d'origine sont livrés ou
dissous, et un écran annonçant « arrive au lot 2 » alors que le lot 2 est en
production depuis des semaines dit au lecteur que le produit est à l'arrêt.
`tests/roadmap.test.ts` interdit désormais le retour de l'ancienne numérotation.

### ~~Lot A — Confiance~~ · **livré** (migrations 0047, 0048 et 0049)

`/pro/avis` · `/admin/avis` · `/admin/signalements` · `/admin/litiges`

Avis et notes après prestation, droit de réponse, signalements, litiges.

Ce qu'il a fallu trancher, et qui n'était pas évident :

- **Une faille d'écriture, refermée d'abord.** `0003_catalogue.sql:597` accordait
  `insert, update, delete` sur treize tables d'un coup, dont `listings` :
  combiné à `listings_update`, qui ouvre la ligne entière au propriétaire, un
  partenaire écrivait sa propre note. Cela ne se voyait pas faute d'affichage —
  mais le tri par défaut du catalogue est `rating_avg desc`, et ce lot allumait
  l'affichage. La migration 0047 énumère les colonnes écrivables et en retire
  les **cinq colonnes dérivées**. `partner_profiles` avait été protégé pour ces
  colonnes exactement en 2021 ; `listings` porte les deux mêmes et avait été
  oubliée.
- **Rien dans les données ne dit qu'une prestation a eu lieu.** Aucun état de
  commande ne signifie « réalisée », et on n'en a pas ajouté un que personne ne
  marquerait — `acceptance_rate` a passé un an en colonne morte pour cette
  raison. L'éligibilité se déduit de trois faits vérifiables — la commande est
  celle de l'auteur, un règlement est encaissé, la dernière date est passée —
  imposés par un déclencheur et non par la RLS, qui dit quelles lignes et jamais
  à quelles conditions.
- **Le premier avis déposé réordonnait tout le catalogue.** Le tri par défaut
  étant `rating_avg desc`, un unique « 5 » battait une annonce notée 4,8 sur
  cinquante avis. `listing_search.rating_sort` est donc nulle sous **trois
  avis** : la note s'affiche sans classer, et l'écran le dit — une note visible
  qui ne compte pas doit s'expliquer.
- **La signature d'un avis ne vient pas de `profiles`**, qui n'est lisible que
  par son propriétaire. Elle est calculée à l'écriture et stockée (« Clara G. »),
  et un déclencheur la ramène à « Un client » dès qu'un compte est anonymisé.
- **« Retrait immédiat sur signalement » est une arme**, bornée par trois
  verrous : retrait réservé à une partie concernée, immunité d'un avis rétabli,
  plafond de débit. Ce qui reste possible — faire masquer **une fois** chacun de
  ses mauvais avis — est écrit dans `CLAUDE.md` §5 plutôt que prétendu résolu.
  Une **annonce** signalée, elle, n'est jamais retirée automatiquement.
- **Un litige ne déplace pas d'argent.** Il existe un chemin vers le
  remboursement, `cancel_order`, qui applique le barème figé sur la commande ;
  en ouvrir un second dans un lot sur la confiance aurait été le mauvais
  endroit. On rattache le remboursement produit par l'annulation.

⚠️ **Le lot est livré sans une seule donnée** : zéro prestation réalisée en
production. C'était la raison de le faire maintenant — la plomberie doit exister
avant les premières vraies réservations, sinon la première vague d'avis, la plus
difficile à obtenir, se perd. `npm run smoke:avis` joue le parcours entier contre
le vrai Supabase et nettoie derrière lui.

### Lot B — Facturation · 7 écrans

`/pro/finances/factures` · `/pro/finances/commissions` ·
`/entreprise/factures` · `/entreprise/reservations` · `/entreprise/rapports` ·
`/admin/reservations` · `/admin/commissions`

Facture PDF pour le client, relevé de commission pour le partenaire, rapports
de dépenses pour l'entreprise.

**Pourquoi.** Une entreprise ne peut pas passer une dépense sans facture : sans
ce lot, tout le tunnel entreprise s'arrête au moment de payer. Et un partenaire
qui ne voit pas le détail de sa commission finit par la contester.

**Attention.** Toute ventilation passe par `allocate()` — une règle de trois
arrondie ligne à ligne perd des francs. Le montant d'une facture doit être relu
depuis `orders` et `payments`, jamais recalculé à l'affichage.

### ~~Lot C — Comptes & administration~~ · **livré** (migrations 0040 et 0041)

`/admin/utilisateurs` · `/admin/entreprises` · `/admin/categories` ·
`/admin/villes` · `/admin/journal` · `/admin/rapports` ·
`/admin/feature-flags` · `/pro/equipe` · `/pro/documents`

Ce qu'il a fallu ouvrir, et qui n'était pas évident :

- **Trois colonnes de privilège n'étaient écrites par personne.**
  `profiles.account_type`, `organizations.status` et le nouvel
  `feature_flags.enabled` se règlent par `set_account_type`, `set_org_status`
  et `set_feature_flag`. La migration 0021 avait retiré les deux premières du
  `grant update` après trois élévations de privilèges réelles ; un
  administrateur étant `authenticated` comme les autres, un `update` direct ne
  lève rien et ne touche aucune ligne.
- **L'administration ne pouvait pas lire les adresses e-mail** : elles vivent
  dans `auth.users`, que PostgREST n'expose pas. `admin_users()` les en extrait
  derrière `app.is_admin()`. Même chose pour les coordonnées des entreprises,
  que la migration 0036 avait fermées — `admin_companies()`.
- **Deux verrous contre l'enfermement** : un administrateur ne peut pas se
  retirer l'administration, et le dernier administrateur ne peut pas être
  rétrogradé. Sans eux, la seule sortie serait une requête SQL sur le projet.
- **Le seau des pièces justificatives n'existait pas.** `kyc_documents`
  attendait depuis la migration 0002 un stockage qui n'avait jamais été créé :
  un partenaire ne pouvait déposer ni RCCM, ni IFU, ni RIB. Le seau
  `justificatifs` est **privé**, contrairement à celui des photos, et se lit
  par URL signée d'une minute.
- **Deux interrupteurs, obéis par des déclencheurs** et non par l'interface :
  fermer les inscriptions partenaires, couper la messagerie. Un interrupteur
  appliqué dans une Server Action laisserait passer tout appel qui ne la
  traverse pas — et `conversations` a trois chemins d'écriture.

**Ce qui n'y est pas** : l'invitation d'un collègue par courriel.
`organization_members.user_id` référence `profiles(id)` — un collègue ne
rejoint l'équipe qu'une fois son compte créé. Porter une invitation *en attente
de compte* demande un modèle que le schéma n'a pas ; l'ajouter à moitié
laisserait des invitations qui n'aboutissent jamais. L'écran dit donc la marche
à suivre. C'est reporté au **lot D**.

### Lot D — Confort · première tranche **livrée** (migration 0042)

✅ `/compte/favoris` · `/compte/documents` · `/pro/statistiques` ·
`/pro/support` · **invitation d'un collègue par courriel**

Ce que la tranche a demandé, et qui n'était pas prévisible :

- **Une table d'invitations à part.** `organization_members.user_id` référence
  `profiles(id)` : on ne peut y inscrire quelqu'un qu'une fois son compte créé,
  alors qu'inviter, c'est s'adresser à quelqu'un qui n'en a pas. Le jeton est
  le secret, et **personne ne peut le lire** — pas même celui qui invite.
- **⚠️ `revoke select (colonne)` ne retire pas un `grant select` de table.**
  Postgres accepte le `revoke` sans rien changer. Le jeton restait donc lisible
  par le propriétaire de la structure, sans la moindre erreur. Il faut
  énumérer les colonnes autorisées, comme la migration 0036 l'avait fait pour
  `organizations`. Un test l'a attrapé ; rien d'autre ne l'aurait fait.
- **Les statistiques partenaire ne lisent pas `partner_profiles`.**
  `acceptance_rate` et `response_time_avg_h` sont annoncées « recalculées par
  déclencheur » depuis la migration 0002 — ce déclencheur n'a jamais existé, et
  les deux colonnes sont nulles sur **tous** les partenaires en production. Les
  chiffres se recalculent donc depuis `quotes`, qui est la source.
- **Un reçu n'est pas une facture**, et le document le dit lui-même. Le RCCM et
  l'IFU sont désormais connus, mais cela ne suffit pas : une facture engage un
  **régime de TVA**, qui est une décision fiscale et non une valeur à recopier.
  Le reçu reste donc un reçu, et la facture reste au lot B.

**Reste au lot D** : `/pro/promotions` et `/admin/promotions` (codes de
réduction), et les **créneaux** matin / après-midi / soirée.

⚠️ Ces deux chantiers **touchent le prix payé**, contrairement à la tranche
livrée. Les promotions passent par `money.ts`, `allocate()` et des tests
obligatoires (§1) ; les créneaux demandent de reprendre le planning partenaire,
le calendrier public et `book_listing`. Bonne nouvelle pour ces derniers :
`availabilities.slot` existe **déjà**, avec l'énumération complète et la clé
unique `(listing_id, date, slot)` — c'est `PLANNING_SLOT = "journee"`, figé
dans le code, qu'il faut ouvrir.

### Lot E — Éditorial & SEO · 2 écrans

`/admin/cms` · `/admin/medias`

Blog, pages éditoriales, packs, médiathèque. Puis le recadrage et la
compression des photos côté navigateur, et la purge du cache CDN à la
suppression d'une photo (une heure d'écart aujourd'hui).

**Pourquoi en dernier.** C'est le lot de croissance : il fait venir du monde
sur un produit qui doit d'abord savoir le servir.

---

## 5. L'ordre que je recommande

0. **Fermer le paiement en ligne sur les annonces fictives** (§3.3). Aujourd'hui
   un inconnu peut régler 300 000 F pour une salle qui n'existe pas. Une
   commande suffit, et c'est réversible. **Rien d'autre ne passe avant.**
1. **Recruter les premiers partenaires**, puis retirer le jeu de démonstration
   et ses quatre comptes (§3.3). Un produit vide ne se teste pas en vrai, et
   c'est désormais la seule chose qui sépare ÉniEvent d'un vrai chiffre
   d'affaires : la chaîne technique, elle, encaisse.
2. **Confirmer le secret du webhook live** par un événement de test (§3.4), et
   **mesurer `/payouts` et `/refunds`** (§3.2). Deux contrôles, zéro code.
3. **Lot B — Facturation.** Débloque le tunnel entreprise, qui ne peut pas
   acheter sans pièce comptable.
4. **Fin du lot D** — promotions et créneaux — puis **lot E**. (Les lots A et C
   et la première tranche du lot D sont livrés.)

Les points 0 à 2 ne demandent pas une ligne de code — ou une seule — et aucun
écran ne vaut plus qu'eux tant qu'ils tiennent.

---

## 6. Tenir ce document à jour

Il ment vite, et un document de route qui ment coûte plus cher qu'une absence
de document. Trois règles :

- **Un lot livré se retire de `src/components/dashboard/roadmap.ts`** et de la
  table du §2. Les deux doivent rester d'accord : `tests/roadmap.test.ts`
  vérifie qu'aucune entrée de menu ne reste orpheline, et qu'aucun lot de
  l'ancienne numérotation ne réapparaît.
- **Le décompte du §2 se mesure, il ne s'estime pas** : il compte les `href` de
  `nav-config.ts` ayant une `page.tsx` correspondante dans `src/app`.
- **Le §3 se relit à chaque mise en ligne.** C'est la seule partie dont le
  contenu change sans qu'aucun commit ne le signale.
