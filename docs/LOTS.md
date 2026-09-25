# Où en est ÉniEvent

Ce qui est en ligne, ce qui reste, et dans quel ordre. **C'est le seul document à
lire pour savoir quoi construire ensuite.** Les plans de `~/.claude/plans/`
décrivent des lots déjà livrés et ne font plus foi.

Dernière mise à jour : 25 septembre 2026, après le lot C, la première tranche du
lot D et la suppression de compte. 678 tests verts, 43 migrations, production sur
https://enievent.com.

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
| Client : favoris et reçus de paiement | En ligne |
| Suppression de compte, sous conditions (client, partenaire, entreprise) | En ligne |
| Pages légales | En ligne, **à compléter** (§3) |

## 2. Le décompte des écrans

61 entrées de menu, **46 construites, 15 en attente**. Chaque entrée non
construite affiche un écran nommant son lot, jamais un 404
(`src/components/dashboard/roadmap.ts`).

| Espace | Livrés | Reste |
|---|---|---|
| Partenaire — `/pro` | 14 / 18 | 4 |
| Entreprise — `/entreprise` | 9 / 12 | 3 |
| Back-office — `/admin` | 15 / 23 | 8 |
| Particulier — `/compte` | **8 / 8** | — |

Le déséquilibre initial est résorbé : le back-office d'exploitation est en
place, et ce qui reste relève des avis, de la facturation et du confort.

---

## 3. ⚠️ Ce qui bloque la commercialisation

**Aucun de ces points n'est un lot de développement.** Ils ne se règlent pas en
écrivant du code, et tant qu'ils tiennent, aucun franc réel ne peut circuler.
Par ordre de blocage :

### 3.1 L'identité légale n'est pas renseignée — bloque tout le reste

`src/lib/legal.ts` porte sept valeurs à `null` : forme juridique, capital,
RCCM, IFU, adresse, téléphone, directeur de publication. Les pages légales les
affichent honnêtement comme « à compléter » plutôt que d'inventer.

C'est exactement ce qu'un prestataire de paiement vérifie à l'ouverture d'un
compte marchand. **Tant que ce fichier n'est pas rempli, le dossier FedaPay ne
peut pas être déposé**, donc aucun paiement réel n'est possible, donc rien
d'autre n'a d'effet commercial. `entityIsComplete()` dit quand c'est bon.

### 3.2 Le compte marchand FedaPay n'est pas validé

Conséquence directe du point précédent, et mesurée sur l'API réelle : avec la
clé même qui obtient `200` sur `/transactions`, le compte reçoit **`403` sur
`/payouts`** et **`401` sur `/refunds`**. Virements et remboursements sont donc
aujourd'hui des **registres** tenus à la main — les écrans existent, ils
n'ordonnent aucun mouvement.

Le jour où le droit s'ouvre, deux fonctions seulement sont à remplacer :
`mark_payout_sent` et `mark_refund_sent`. Le reste de la chaîne est prêt.

### 3.3 Le catalogue est fictif

6 partenaires inventés, 15 annonces, des numéros séquentiels
(`+2290197000001`, `+2290197000002`…). Un visiteur qui appelle tombe sur rien.

Il faut **recruter de vrais partenaires**, puis retirer le jeu de démonstration
de la production — y compris les quatre comptes de démonstration, dont
`demo-admin`, qui est de type `admin`.

### 3.4 Secrets à faire tourner

- Ancienne clé Resend « Full access » — à révoquer.
- Trois jetons OVH — à révoquer.
- `FEDAPAY_WEBHOOK_SECRET` — absente. Sans risque immédiat : `settle_payment`
  relit la transaction chez FedaPay et refuse un montant divergent. À poser dès
  que FedaPay l'expose.

### 3.5 Deux réglages à décider

- **Le taux de commission** est à 10 % provisoire. Il se règle partenaire par
  partenaire depuis `/admin/partenaires` ; le barème général vaut pour les
  autres.
- **DMARC est en `p=none`** — observation seule, aucune sanction. Durcir en
  `p=quarantine` après quelques semaines de rapports (`docs/DEPLOIEMENT.md`
  §3 ter). Prématurément, cela met les confirmations d'inscription en
  indésirable, et le symptôme est silencieux.

---

## 4. Les cinq lots restants

Lettrés, et non numérotés : les lots 1 à 8 du plan d'origine sont livrés ou
dissous, et un écran annonçant « arrive au lot 2 » alors que le lot 2 est en
production depuis des semaines dit au lecteur que le produit est à l'arrêt.
`tests/roadmap.test.ts` interdit désormais le retour de l'ancienne numérotation.

### Lot A — Confiance · 4 écrans

`/pro/avis` · `/admin/avis` · `/admin/signalements` · `/admin/litiges`

Avis et notes après prestation, modération de ces avis, traitement des litiges.

**Pourquoi en premier.** C'est le seul lot qui manque à la **vitrine**, pas à
l'exploitation. Aujourd'hui aucune annonce ne porte de note, et le dépôt
s'interdit d'en fabriquer (`CLAUDE.md` §5) : un premier client n'a donc rien
pour départager deux salles. C'est aussi ce qui fait revenir un partenaire —
une note gagnée se défend.

**Le piège à éviter.** Un avis n'est légitime que s'il suit une prestation
réellement payée. Le lien se fait sur `orders`, pas sur un formulaire ouvert,
sinon la première salle venue s'auto-note. Et la section « Les valeurs sûres »
de l'accueil ne s'allume qu'une fois des notes réelles en base.

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
- **Un reçu n'est pas une facture**, et le document le dit lui-même : sans RCCM
  ni IFU dans `legal.ts`, émettre une pièce fiscale serait faux. La facture
  reste au lot B.

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

1. **Remplir `src/lib/legal.ts`** puis déposer le dossier FedaPay (§3.1, §3.2).
   Tant que ce n'est pas fait, tout le reste est du code qui attend.
2. **Recruter les premiers partenaires** et retirer le catalogue fictif (§3.3).
   Un produit vide ne se teste pas en vrai.
3. **Lot A — Confiance.** Le seul lot que le client voit.
4. **Lot B — Facturation.** Débloque le tunnel entreprise.
5. **Fin du lot D** — promotions et créneaux — puis **lot E**. (Le lot C et la
   première tranche du lot D sont livrés.)

Les points 1 et 2 ne demandent pas une ligne de code, et rien de ce qui suit
n'a d'effet commercial avant eux.

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
