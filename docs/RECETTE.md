# Cahier de recette

Comment vérifier ÉniEvent de bout en bout, à la main. Compter 30 minutes.

## Préparer

```bash
npm install
npm run demo:reset     # jeu de données béninois + 4 comptes de démonstration
npm run dev
```

> **Vérifiez le port annoncé par `npm run dev`.** Le 3000 est souvent occupé par
> une autre application, et Next bascule alors sur un autre port. Une page servie
> par l'autre application donnerait l'illusion que tout fonctionne : les routes
> `/`, `/connexion` et `/inscription` existent aussi ailleurs.

### Comptes de démonstration

Mot de passe commun : `Demo!EniEvent2026`

| Compte | Se connecter sur | Atterrit sur |
|---|---|---|
| `demo-particulier@enievent.bj` | `/connexion` | `/compte` |
| `demo-entreprise@enievent.bj` | `/connexion` | `/entreprise` |
| `demo-partenaire@enievent.bj` | `/pro/connexion` | `/pro/dashboard` |
| `demo-admin@enievent.bj` | `/connexion` | `/admin` |

La confirmation d'e-mail est **désactivée sur le projet de développement** : la
création d'un compte est immédiate. À réactiver avant la production, avec un
SMTP Resend et un domaine vérifié.

---

## 1. Accueil

1. Ouvrir `/`.
2. **Attendu** : la barre de recherche ouvre le bandeau, au-dessus du titre
   centré, sur la photo de fond. Aucune mention de « Afrique de l'Ouest ».
3. Déplier **Plus de filtres** : budget, mode de réservation, équipements.
4. Choisir une catégorie et une ville, puis **Rechercher** : l'URL de `/recherche`
   porte les filtres choisis.
5. Les liens de l'en-tête (Lieux, Prestataires, Catégories) mènent tous à une
   page réelle — aucun 404.

## 2. Recherche et filtres

1. Ouvrir `/recherche`. **Attendu** : 14 résultats.
2. Filtrer par ville **Cotonou** → 7 résultats. L'URL contient `?ville=Cotonou`.
3. Ajouter la catégorie **Traiteur** → 2 résultats.
4. **Recharger la page (F5)** : les filtres et les résultats sont identiques.
   C'est le point important — l'URL est la source de vérité.
5. Copier l'URL dans un onglet privé : même résultat, sans être connecté.
6. Trier par **Prix croissant** : le premier résultat est le moins cher.
7. **Chaque prix affiche son unité** : « à partir de 12 000 FCFA par personne »,
   « à partir de 3 500 FCFA le m² ». Un montant sans son unité laisserait croire
   qu'une décoration de salle coûte 3 500 F.
8. Effacer les filtres → retour à 14 résultats et à l'URL `/recherche`.

## 3. Carte

1. Sur `/recherche`, basculer en vue **Carte**.
2. **Attendu** : les lieux apparaissent autour de Cotonou avec leur prix. Les
   prestations de service n'ont pas d'adresse fixe et ne sont pas localisées.
3. Cliquer un repère ouvre la fiche correspondante.

## 4. Fiche annonce et calcul du prix

1. Ouvrir `/lieux/salle-etoile-haie-vive`.
2. **Attendu** : capacités (200 assis, 250 debout), équipements dont groupe
   électrogène et climatisation, et surtout les conditions **en français clair** —
   « Un acompte de 50 % bloque la date… » et non un jargon de politique.
3. Dans l'encart de réservation, choisir **un vendredi** : le total affiche
   150 000 FCFA + 10 % de frais de service.
4. Ajouter **le samedi suivant** : ce jour est majoré (195 000 FCFA), la mention
   « week-end » apparaît, et le total est recalculé.
5. Les **lundis sont grisés** : le jeu de démonstration les ferme.
6. Ouvrir `/prestataires/buffet-beninois-200-couverts` : pas de calendrier, un
   bouton « Demander un devis » seul — cette annonce est en mode devis.

## 5. Cloisonnement des espaces

1. Se connecter avec `demo-partenaire@enievent.bj` sur **`/pro/connexion`**.
   **Attendu** : le tableau de bord partenaire, la barre latérale affiche
   « Espaces Cotonou ».
2. Aller sur `/admin`. **Attendu** : une page qui **explique** le refus, avec un
   bouton pour changer de compte — pas une redirection muette vers la connexion,
   qui laisserait croire à une session expirée.
3. Se déconnecter : on revient sur `/pro/connexion`, jamais sur `/connexion`.
4. Se connecter avec `demo-particulier@enievent.bj` sur `/connexion`, puis aller
   sur `/entreprise` : refus expliqué « Vous n'êtes rattaché à aucune entreprise ».
5. Se connecter avec `demo-admin@enievent.bj` : `/admin` s'ouvre.

## 6. La boucle de l'offre — partenaire puis administrateur

C'est le parcours qui fait exister le catalogue.

1. Se connecter avec `demo-partenaire@enievent.bj` sur **`/pro/connexion`**.
   **Attendu** : le tableau de bord affiche « Espaces Cotonou », ses compteurs et
   des encarts d'action si quelque chose manque.
2. **Mes annonces** → les annonces de l'organisation, avec leur état en clair
   (« En ligne », et non « approved »).
3. **Nouvelle annonce** : titre, catégorie, ville, mode de réservation.
   **Attendu** : création d'un brouillon et ouverture de son éditeur.
4. Dans l'éditeur, cliquer **Soumettre à la validation** sans rien remplir.
   **Attendu** : refus expliquant ce qui manque — une description d'au moins
   40 caractères et un tarif.
5. Dans **Tarifs**, dérouler **Unité**. **Attendu** : sept unités, dont
   **Au mètre carré** — facturation courante pour les chapiteaux, la moquette,
   les stands et l'habillage de salle.
6. Compléter description, tarif principal et capacités, puis soumettre.
   **Attendu** : « En cours de vérification ».
7. Se déconnecter, se connecter avec `demo-admin@enievent.bj`, aller sur
   **`/admin/moderation`**. **Attendu** : l'annonce apparaît, avec ses points de
   contrôle (description, tarif, conditions, prix plancher, capacités).
8. Cliquer **Renvoyer au partenaire** avec un motif de moins de 15 caractères.
   **Attendu** : refus — un motif inexploitable n'aiderait pas le partenaire.
9. Donner un vrai motif, envoyer. Se reconnecter en partenaire : l'annonce est
   « À corriger », le motif est affiché.
10. Resoumettre, revenir en admin, **Valider et publier**.
11. Sans être connecté, chercher l'annonce sur `/recherche`. **Attendu** : elle
    y est, avec son tarif **et son unité**.

> Le même parcours est vérifié automatiquement par `npm run smoke:offre`, y
> compris ce qui ne se teste pas à la main : qu'un partenaire ne peut pas valider
> sa propre annonce, ni modifier celle d'un concurrent.

## 7. Planning et tarifs

Une annonce publiée ne se réserve pas tant qu'aucune date n'est ouverte.

1. En partenaire, ouvrir **Planning & tarifs**.
2. **Attendu** : le calendrier du mois, une légende en clair, et un encart
   signalant les dates **non renseignées** — celles qui n'apparaissent dans
   aucune recherche.
3. Naviguer jusqu'à un mois lointain (au-delà de six mois) : toutes les dates y
   sont en pointillés, avec le **tarif prévu** affiché en petit — c'est le tarif
   de base de l'annonce, majoré le week-end.
4. Cliquer **Week-ends** : seuls les samedis et dimanches à venir se
   sélectionnent. Les dates passées et les dates réservées restent hors
   sélection.
5. Saisir un tarif nettement inférieur au prix plancher de l'annonce, puis
   **Ouvrir ces dates**. **Attendu** : refus nommant le prix plancher — c'est le
   garde-fou contre la faute de frappe à un zéro près.
6. Saisir un tarif correct et ouvrir. **Attendu** : les cases passent au vert,
   le tarif s'affiche, et « Recette possible » se met à jour.
7. Sélectionner une de ces dates, cliquer **Fermer**. **Attendu** : la case
   grise **garde son tarif** — rouvrir ne demandera pas de le ressaisir.
8. Revenir au tableau de bord : l'encart « Aucune date ouverte » a disparu.
9. Sans être connecté, ouvrir la fiche publique de l'annonce : les dates
   ouvertes sont sélectionnables dans le calendrier, les autres non.

> `npm run smoke:planning` rejoue ce parcours contre la vraie base, y compris ce
> qui ne se voit pas à l'écran : que le prix plancher est refusé **par la base**
> et pas seulement par le formulaire, et qu'un partenaire concurrent ne peut ni
> ouvrir ni retarifer les dates d'autrui.

## 8. Appel d'offres — le second tunnel

Le cœur du produit : décrire une fois, recevoir plusieurs devis, comparer.
`npm run demo:reset` crée déjà un brief avec une offre reçue, pour que les deux
écrans ne s'ouvrent pas vides.

**Côté client**

1. Se connecter avec `demo-particulier@enievent.bj`, ouvrir **Mes projets**.
   **Attendu** : « Séminaire annuel — 150 personnes », 1 devis reçu sur 2
   prestations, et le délai restant.
2. Ouvrir le projet. **Attendu** : le brief en tête, puis **une section par
   prestation**. La salle a une offre ; le traiteur affiche « Les prestataires
   de cette catégorie ont reçu votre demande ».
3. Déplier **Voir le détail** : les trois lignes de l'offre, avec quantités et
   prix unitaires. Comparer deux totaux sans voir ce qu'ils recouvrent est le
   meilleur moyen de choisir la mauvaise offre.
4. Cliquer **Écarter** et saisir moins de 10 caractères. **Attendu** : refus —
   un motif inexploitable n'aide pas le prestataire à progresser.
5. Cliquer **Retenir cette offre**. **Attendu** : l'offre passe « Votre choix »,
   et la prestation n'accepte plus de décision.

**Côté partenaire**

6. Se connecter avec `demo-partenaire@enievent.bj`. **Attendu** : le tableau de
   bord annonce les demandes qui le concernent.
7. **Demandes reçues** : seules les demandes correspondant à ses annonces
   publiées apparaissent — c'est la base qui le décide, pas l'écran.
8. Ouvrir son devis. **Attendu** : la demande du client reste affichée au-dessus
   de l'éditeur ; le total est calculé depuis les lignes et ne se saisit pas.
9. Sur un devis **envoyé**, essayer de modifier une ligne : impossible. Le client
   compare des montants, ils doivent rester ceux qu'on lui a proposés.

**Nouveau brief de bout en bout**

10. En client, ouvrir **Demander des devis** depuis l'en-tête. Choisir plusieurs
    prestations, remplir, envoyer. **Attendu** : redirection vers le projet créé,
    avec sa référence `DEM-…`.
11. Soumettre sans cocher « ma date est souple » et sans date. **Attendu** :
    refus — sans date, un prestataire ne peut pas dire s'il est libre.

> `npm run smoke:devis` rejoue ce cycle avec **deux prestataires concurrents**,
> et vérifie ce qu'aucun test manuel ne peut vérifier : qu'aucun des deux ne voit
> l'offre de l'autre, que le client ne voit pas les brouillons, qu'un devis ne
> s'accepte pas par une simple mise à jour, et qu'accepter refuse le rival dans
> la même transaction.

## 9. Écrans à venir

Cliquer n'importe quelle entrée de menu non encore construite — par exemple
**Versements**, **Promotions** ou **Journal d'audit**.
**Attendu** : une page qui nomme le lot livrant cet écran, et non un 404.

## 10. Inscription réelle

1. Se déconnecter, ouvrir `/inscription`.
2. Onglet **Particulier** : renseigner un e-mail neuf, un mot de passe de
   10 caractères minimum. **Attendu** : accès immédiat à `/compte`.
3. Ouvrir `/pro/inscription`, saisir le téléphone `97 00 00 01`.
   **Attendu** : refus — c'est l'ancien format à 8 chiffres, plus composable
   depuis le 30 novembre 2024.
4. Saisir `01 97 00 00 01` : accepté. Le compte, l'organisation partenaire et la
   fiche prestataire sont créés ensemble ; le tableau de bord affiche le nom de
   la structure.

## 11. Mobile

Refaire les étapes 1, 2, 4, 7 et 8 dans une fenêtre de **390 px de large**.
**Attendu** : les filtres se replient derrière un bouton « Afficher », aucun
débordement horizontal, le calendrier reste dans l'écran, et la barre d'action
du planning reste collée en bas — la sélection se fait en haut de l'écran, les
boutons doivent rester atteignables sans remonter.

---

## Vérifications automatiques

```bash
npm run verify         # typecheck + lint + 298 tests
npm run db:verify      # migrations rejouées dans un Postgres jetable, RLS partout
npm run smoke          # 13 contrôles contre le vrai Supabase, comptes purgés après
npm run smoke:offre    # la boucle partenaire → modération → catalogue, en réel
npm run smoke:planning # ouverture des dates, prix plancher, cloisonnement
npm run smoke:devis    # appel d'offres : offres scellées, acceptation atomique
```

---

## Volontairement absent à ce stade

Pour éviter de chercher ce qui n'existe pas encore. Les entrées de menu
correspondantes affichent un écran nommant leur lot, pas un 404.

| Absent | Arrive au |
|---|---|
| Panier, paiement, réservation effective | Lot 2 |
| Créneaux (matin, après-midi, soirée) — le planning ouvre à la journée | Lot 4 |
| Notification par e-mail d'un nouveau devis (domaine Resend à vérifier) | Lot 4, suite |
| Espace entreprise : budgets, centres de coûts, facturation | Lot 5 |
| Avis, litiges, contrats, messagerie | Lot 6 |
| Reste du back-office admin : KYC, finances, CMS, audit | Lot 7 |
| Packs, pages éditoriales, blog, pages légales | Lots 4 et 8 |
| Photos réelles des annonces | Quand les partenaires téléverseront |
