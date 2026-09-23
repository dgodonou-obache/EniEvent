# Où en est ÉniEvent

Ce qui est en ligne, ce qui reste, et dans quel ordre. **C'est le seul document à
lire pour savoir quoi construire ensuite.** Les plans de `~/.claude/plans/`
décrivent des lots déjà livrés et ne font plus foi.

Dernière mise à jour : 23 septembre 2026, au commit `7b93bb9`.
628 tests verts, 39 migrations, production sur https://enievent.com.

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
| Pages légales | En ligne, **à compléter** (§3) |

## 2. Le décompte des écrans

61 entrées de menu, **33 construites, 28 en attente**. Chaque entrée non
construite affiche un écran nommant son lot, jamais un 404
(`src/components/dashboard/roadmap.ts`).

| Espace | Livrés | Reste |
|---|---|---|
| Partenaire — `/pro` | 10 / 18 | 8 |
| Entreprise — `/entreprise` | 9 / 12 | 3 |
| Back-office — `/admin` | 8 / 23 | **15** |
| Particulier — `/compte` | 6 / 8 | 2 |

Le déséquilibre est voulu : les écrans livrés sont ceux que traverse l'argent.
Le back-office restant est de l'outillage d'exploitation — utile à vous, jamais
à un client.

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

### Lot A — Confiance · 3 écrans

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

### Lot B — Facturation · 5 écrans

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

### Lot C — Comptes & administration · 9 écrans

`/admin/utilisateurs` · `/admin/entreprises` · `/admin/categories` ·
`/admin/villes` · `/admin/journal` · `/admin/rapports` ·
`/admin/feature-flags` · `/pro/equipe` · `/pro/documents`

Le back-office d'exploitation : gérer les comptes, le référentiel, lire le
journal d'audit, inviter un collègue par courriel.

**Pourquoi.** C'est ce qui vous évite d'ouvrir SQL pour la moindre correction.
Le travail est volumineux mais peu risqué : ces écrans lisent et écrivent des
données déjà modélisées.

**Attention.** Toute colonne qui **définit un privilège** — `account_type`,
`role`, `status`, une commission — se protège par un droit de colonne **et** un
déclencheur, jamais par la seule RLS (`CLAUDE.md` §3). Un écran
« Utilisateurs » est précisément l'endroit où cette règle se perd.

### Lot D — Confort · 6 écrans

`/compte/favoris` · `/compte/documents` · `/pro/promotions` ·
`/pro/statistiques` · `/pro/support` · `/admin/promotions`

Favoris, documents du client, codes promotionnels, statistiques partenaire,
aide. S'y ajoutent les **créneaux** (matin, après-midi, soirée) : le planning
n'ouvre aujourd'hui qu'à la journée.

**Pourquoi après.** Rien ici n'empêche une vente. Les promotions touchent
l'argent et passent donc par `money.ts` et des tests, comme les autres modules
financiers.

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
5. **Lot C**, puis **D**, puis **E**.

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
