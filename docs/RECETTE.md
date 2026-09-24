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

Mot de passe commun : la valeur de `DEMO_PASSWORD` dans votre `.env.local`.

> Il ne figure **pas** dans ce dépôt, et ne doit jamais y revenir. Écrit en
> clair, il ouvrait `demo-admin` — un compte de type `admin` — sur un dépôt
> public : n'importe quel lecteur entrait dans le back-office.
>
> Pour en poser un sur une machine neuve :
> `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`,
> puis `npm run demo:users` pour l'appliquer aux quatre comptes.

| Compte | Se connecter sur | Atterrit sur |
|---|---|---|
| `demo-particulier@enievent.bj` | `/connexion` | `/compte` |
| `demo-entreprise@enievent.bj` | `/connexion` | `/entreprise` |
| `demo-partenaire@enievent.bj` | `/pro/connexion` | `/pro/dashboard` |
| `demo-admin@enievent.bj` | **`/admin/connexion`** | `/admin` |

La confirmation d'e-mail est **active**. Une inscription n'ouvre donc pas de
session : le formulaire affiche « Vérifiez votre boîte mail », et le compte ne
sert qu'après le clic sur le lien reçu. Les quatre comptes ci-dessus sont créés
déjà confirmés par l'API d'administration — ils se connectent directement.

Ces messages partent de **Supabase Auth**, par le SMTP de Resend
(`smtp.resend.com` port 465, utilisateur `resend`, expéditeur
`ÉniEvent <contact@enievent.com>`). Une inscription qui n'aboutit jamais se
diagnostique donc dans les journaux Resend d'abord, et dans les journaux
d'authentification Supabase ensuite — pas dans une boîte OVH, qui n'est plus sur
le chemin.

> ⚠️ **Un courriel « delivered » ne prouve pas que le lien fonctionne.** Le
> symptôme à connaître : le message arrive, le bouton mène droit à « Ce lien
> n'est plus valable ». La cause n'est jamais l'expiration — c'est le gabarit.
> Voir `CLAUDE.md` §8 : tout lien passe par `{{ .TokenHash }}` et
> `/auth/confirm`, jamais par `{{ .ConfirmationURL }}`.

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
6. **« Réservez sans attendre »** : des cartes d'annonces, pas des pastilles.
   **Attendu** : uniquement des annonces acceptant la réservation immédiate
   **et** ayant des dates ouvertes. Fermer tout le planning d'une de ces
   annonces depuis `/pro/planning` la fait disparaître de la section — la mise
   en avant suit un fait, elle n'est pas figée à la main.
7. **« Nos prestations »** : des cartes par famille, avec le nombre d'offres.
   **Attendu** : aucun métier à zéro annonce. Cliquer n'importe lequel donne des
   résultats — c'est tout l'objet : l'accueil ne promet que ce qui existe.
   Le référentiel complet, métiers vides compris, reste sur `/categories`.
8. Se connecter, puis revenir sur `/`. **Attendu** : l'en-tête affiche votre
   prénom et mène à **votre** espace ; ni « Connexion », ni « Inscription »,
   ni dans l'en-tête ni dans le pied de page.

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
   150 000 FCFA. **Attendu : aucune ligne de frais, aucune commission, rien
   au-delà du prix.** Le client paie le prix affiché ; la plateforme se rémunère
   sur la part du partenaire, à l'encaissement. Toute mention de « frais de
   service » à cet écran est un défaut bloquant, pas un détail de copie.
4. Ajouter **le samedi suivant** : ce jour est majoré (195 000 FCFA), la mention
   « week-end » apparaît, et le total est recalculé — toujours sans frais.
5. Les **lundis sont grisés** : le jeu de démonstration les ferme.
6. Sur une annonce ayant des photos, cliquer la grande image **ou une vignette**.
   **Attendu** : la visionneuse s'ouvre sur la photo cliquée, avec le compteur
   « 2 / 5 ». Flèches du clavier, glissement du doigt sur mobile, Échap pour
   fermer — et le focus revient sur la vignette de départ.
7. Ouvrir `/prestataires/buffet-beninois-200-couverts` : pas de calendrier, un
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
5. Dans **Photos**, cliquer **Ajouter des photos** et en choisir deux ou trois.
   **Attendu** : elles apparaissent en vignettes, la première devient la
   couverture. Le fichier part directement du navigateur vers le stockage.
6. Essayer une photo HEIC prise avec un iPhone. **Attendu** : refus expliquant
   qu'il faut la convertir — ce format n'est pas lisible par tous les
   navigateurs, l'accepter donnerait une annonce aux photos invisibles.
7. Cliquer l'étoile d'une autre photo. **Attendu** : elle devient la couverture,
   et c'est elle qui apparaîtra dans les résultats de recherche.
8. Dans **Tarifs**, dérouler **Unité**. **Attendu** : sept unités, dont
   **Au mètre carré** — facturation courante pour les chapiteaux, la moquette,
   les stands et l'habillage de salle.
9. Compléter description, tarif principal et capacités, puis soumettre.
   **Attendu** : « En cours de vérification ».
10. Se déconnecter, se connecter avec `demo-admin@enievent.bj`, aller sur
    **`/admin/moderation`**. **Attendu** : l'annonce apparaît, avec ses points de
    contrôle (description, tarif, conditions, prix plancher, capacités).
11. Cliquer **Renvoyer au partenaire** avec un motif de moins de 15 caractères.
    **Attendu** : refus — un motif inexploitable n'aiderait pas le partenaire.
12. Donner un vrai motif, envoyer. Se reconnecter en partenaire : l'annonce est
    « À corriger », le motif est affiché.
13. Resoumettre, revenir en admin, **Valider et publier**.
14. Sans être connecté, chercher l'annonce sur `/recherche`. **Attendu** : elle
    y est, avec sa photo de couverture, son tarif **et son unité**.

> Le même parcours est vérifié automatiquement par `npm run smoke:offre`, y
> compris ce qui ne se teste pas à la main : qu'un partenaire ne peut pas valider
> sa propre annonce, ni modifier celle d'un concurrent.
>
> `npm run smoke:photos` vérifie le stockage réel : qu'un concurrent ne peut ni
> déposer ni effacer dans le dossier d'autrui, et que l'URL publique est bien
> lisible sans connexion.

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

## 9. Espace entreprise — engager à plusieurs

Ce qui distingue une entreprise d'un particulier : **la personne qui choisit
n'est pas celle qui paie**. `npm run demo:reset` prépare deux centres de coûts,
un seuil de validation à 1 500 000 FCFA et une offre au-dessus de ce seuil.

1. Se connecter avec `demo-entreprise@enievent.bj` sur `/connexion`.
   **Attendu** : le tableau de bord annonce l'engagement qui attend un aval, et
   la consommation budgétaire.
2. **Budgets** : deux centres de coûts avec leur enveloppe, leur consommation et
   ce qu'il reste. « Engagé » compte les offres **retenues**, pas les sommes
   versées — une acceptation engage bien avant le premier paiement.
3. Créer un centre de coût avec un code déjà pris. **Attendu** : refus nommant
   le doublon, pas une erreur technique.
4. **Projets** : les demandes de **toute l'entreprise**, avec leur auteur et leur
   centre de coût. C'est la différence avec `/projets` côté particulier : un
   collègue qui reprend un dossier doit tout retrouver.
5. Ouvrir le projet, déplier l'offre reçue. **Attendu** : le bouton dit
   « Aval demandé » et non « Retenir cette offre » — au-dessus du seuil, on ne
   propose pas un geste que la base refusera.
6. **Validations** : l'engagement avec tout son contexte — projet, prestataire,
   centre de coût, et ce qu'il reste dessus. Refuser avec un motif de moins de
   10 caractères. **Attendu** : refus.
7. Cliquer **Approuver et retenir l'offre**. **Attendu** : l'offre passe
   « Votre choix » et le budget du centre de coût bouge dans la foulée —
   l'aval **est** l'acceptation, en une seule transaction.
8. **Paramètres** : vider le seuil de validation. **Attendu** : plus aucun aval
   demandé ; chaque organisateur engage seul l'entreprise.
9. **Équipe** : les membres et leur rôle en clair. Si aucun valideur n'est actif
   alors qu'un seuil est fixé, un avertissement le signale — sinon les
   engagements resteraient bloqués sans que personne ne comprenne.
10. Déposer une demande depuis **Demander des devis**. **Attendu** : un champ
    « Centre de coût » apparaît, absent pour un particulier.

> `npm run smoke:entreprise` rejoue ce circuit en réel, y compris ce qui ne se
> teste pas à la main : qu'un organisateur ne peut pas valider son propre
> engagement, et qu'un prestataire ne voit ni les budgets ni les avals de son
> client.

## 10. Réserver et payer

Le premier parcours qui fait entrer de l'argent. FedaPay tourne en **bac à
sable** : aucun franc réel ne bouge, et l'écran le dit.

1. En particulier, ouvrir une annonce en **réservation immédiate**, choisir une
   date ouverte, réserver. **Attendu** : une commande avec sa référence `CMD-…`.
2. Ouvrir **Mes réservations**. **Attendu** : la ligne porte le **nom de
   l'annonce** (« Salle Étoile — Haie Vive »), l'enseigne en seconde ligne.
   Un client reconnaît ce qu'il a réservé, pas la raison sociale qui le loue.
3. **Attendu** : l'échéancier **entier** est visible avant le premier
   règlement — acompte et solde, avec leurs dates. Découvrir un second
   versement après avoir payé le premier fait abandonner, à juste titre.
4. Seule la **prochaine** échéance porte un bouton ; les suivantes s'affichent
   en attente. Les règlements se font dans l'ordre, la base l'impose.
5. Cliquer **Régler**. **Attendu** : la page FedaPay, avec le bandeau
   « Mode test ». Payer avec un moyen de test.
6. Revenir. **Attendu** : l'échéance passe « Réglé », la barre d'avancement
   bouge, « Reste à régler » se met à jour.
7. **Attendu, partout dans ce parcours : aucun frais.** Le montant réglé est
   celui de la fiche, au franc près.
8. Faire échouer volontairement un paiement, puis recommencer. **Attendu** :
   le second essai fonctionne — un refus ne bloque pas la commande.

> `npm run smoke:paiement` ouvre une vraie transaction en bac à sable et refuse
> de tourner sur une clé de production. `npm run smoke:commande` rejoue la
> commande complète contre le vrai Supabase.

## 11. Annuler et rembourser

**La retenue s'annonce avant, jamais après.** C'est le premier motif de litige
d'une place de marché.

1. Sur une réservation payée dont la date est **lointaine**, cliquer
   **Annuler cette réservation**. **Attendu** : la somme exacte qui sera rendue,
   en francs — pas un taux à appliquer soi-même, pas le seul nom du barème.
2. **Attendu** : deux gestes. Le premier ouvre, le second confirme. Une
   annulation ne se rattrape pas ; la date repart au catalogue aussitôt.
3. Confirmer. **Attendu** : la commande passe « Annulée », et la date redevient
   réservable sur la fiche publique.
4. Recommencer sur une réservation dont la date est **proche** (dans le barème,
   au-delà du seuil de gratuité). **Attendu** : le remboursement annoncé est
   **partiel**, et la retenue est dite en clair avant de confirmer.
5. Essayer d'annuler une réservation dont la date est **passée**.
   **Attendu** : refus. On ne verse au partenaire qu'après la prestation et on
   n'annule qu'avant : les deux fenêtres ne se recouvrent jamais, donc on ne
   peut pas rembourser un client avec de l'argent déjà parti.
6. Côté partenaire, annuler une réservation acceptée. **Attendu** : le client
   est remboursé **intégralement**, quel que soit le barème. Celui-ci protège le
   partenaire du changement d'avis du client, pas de sa propre défaillance.
7. En administrateur, ouvrir **`/admin/remboursements`**. **Attendu** : le
   remboursement attend d'être exécuté à la main et d'être marqué envoyé.
   FedaPay refuse `/refunds` tant que le compte marchand n'est pas validé :
   l'écran est un **registre**, il ne déclenche aucun virement.

> `npm run smoke:annulation` réserve, encaisse, annule et rembourse contre le
> vrai Supabase, puis nettoie derrière lui.

## 12. Messagerie — parler sans se donner ses coordonnées

Le seul revenu de la plateforme est la commission. Si le client et le
prestataire s'échangent leurs numéros avant de réserver, la vente se fait
ailleurs et la commission s'applique à zéro.

1. Sans être connecté, ouvrir une fiche annonce. **Attendu** : **aucun numéro
   de téléphone nulle part**, ni à l'écran, ni dans le code source de la page.
   L'annuaire est fermé depuis la migration 0036.
2. En particulier, cliquer **Poser une question** sous l'encart de réservation.
   Écrire un message contenant un numéro : `Appelez-moi au 01 97 00 00 01`.
3. Se connecter en partenaire, ouvrir **Messages**. **Attendu** : le message
   est là, **le numéro masqué**, et le client n'est désigné que par « Le
   client » — aucun nom tant qu'aucune commande n'existe.
4. Répondre en glissant une adresse e-mail. **Attendu** : masquée aussi, et
   masquée **des deux côtés** — la règle n'est pas à sens unique.
5. Essayer les autres formes : `+229 01 97 00 00 01`, `0197000001`,
   `01.97.00.00.01`. **Attendu** : toutes masquées. En revanche un prix
   (`150 000`), une date et une référence `CMD-…` restent lisibles — masquer
   un montant rendrait la négociation impossible.
6. Échanger **dix messages d'affilée** dans le même sens. **Attendu** : le
   destinataire reçoit **un seul** courriel, pas dix. Sa réponse rouvre le
   droit d'alerter.
7. Ouvrir ce courriel. **Attendu** : il annonce qu'un message attend, avec
   l'expéditeur et le contexte — **jamais le texte du message**. Y mettre un
   extrait suffirait à contourner tout le masquage.
8. Aller jusqu'au paiement (chapitre 10), puis rouvrir le fil.
   **Attendu** : les coordonnées apparaissent **en clair**, dans les anciens
   messages compris. La commission est acquise, les deux parties doivent
   pouvoir se coordonner.
9. En partenaire, ouvrir **Demandes reçues** et poser une question sur une
   demande. **Attendu** : possible sans savoir qui est le client.
10. Vérifier qu'un **second partenaire** ne voit pas ce fil.

> Le masquage est un **ralentisseur, pas un mur** : « zéro un quatre-vingt-dix-
> sept » passera toujours. Il rend le contournement volontaire et visible, ce
> qui suffit à décourager l'usage par simple commodité.
>
> `npm run smoke:messagerie` est le **seul** endroit où se vérifie l'absence de
> droit de lecture directe sur `messages` : PGlite ne reproduit pas les droits
> par défaut de Supabase, un test local passerait sans rien prouver.

## 13. Commission par partenaire

1. En administrateur, ouvrir **`/admin/partenaires`**. **Attendu** : chaque
   partenaire avec son taux, et l'**origine** de ce taux — barème général ou
   décision propre. Un taux affiché sans son origine se lit comme une décision
   qu'on aurait prise sur ce partenaire.
2. Fixer un taux propre à un partenaire, puis passer une réservation chez lui.
   **Attendu** : la ventilation suit ce taux, et le client paie **le même
   prix** — la commission se prend sur la part du partenaire.
3. **Vider** le champ. **Attendu** : le partenaire revient au barème général.
   Un champ vide n'est pas un taux de zéro : l'un suit la règle, l'autre est
   une décision.
4. Modifier le barème général. **Attendu** : les partenaires à taux propre ne
   bougent pas.
5. **Attendu** : les commandes **déjà passées** ne changent pas de commission.
   Le taux est figé à la création, comme le barème d'annulation — les
   conditions d'une réservation conclue ne se réécrivent pas.

## 14. Back-office : comptes, référentiel, exploitation

En administrateur, sur `demo-admin@enievent.bj`.

**Comptes**

1. **`/admin/utilisateurs`**. **Attendu** : chaque compte avec son **adresse
   e-mail** — elle ne vient pas de `profiles`, qui n'en porte aucune — et la
   mention **« Adresse jamais confirmée »** en évidence le cas échéant. C'est
   le premier symptôme d'un courriel qui n'arrive pas.
2. Chercher `demo`. **Attendu** : la liste se réduit, l'URL porte `?q=demo`.
3. Passer un compte de « Particulier » à « Partenaire », **Appliquer**.
   **Attendu** : confirmation, et le changement tient après rechargement.
4. Choisir « Administration » pour quelqu'un. **Attendu** : un encart rouge
   prévient que ce compte ouvrira le back-office entier — **avant** de
   confirmer, pas après.
5. Essayer de **vous** retirer l'administration. **Attendu** : refus expliquant
   que vous ne pourriez plus revenir sur cet écran. Ce n'est pas une politesse :
   `/admin` est refusé dans le proxy, la porte se refermerait derrière vous.
6. **`/admin/entreprises`**. **Attendu** : les entreprises clientes, leurs
   coordonnées et leur nombre de membres. Suspendre une entreprise demande
   **deux gestes**, et le second annonce ce qui va se passer.

**Référentiel**

7. **`/admin/categories`** → **Ajouter une catégorie**, saisir un nom déjà pris.
   **Attendu** : « … existe déjà », pas une erreur de clé dupliquée.
8. **Renommer** une catégorie. **Attendu** : l'adresse publique ne change pas —
   les liens déjà partagés et indexés continuent de fonctionner.
9. **Masquer** une catégorie pourvue. **Attendu** : elle disparaît des filtres,
   **et ses annonces restent en ligne et réservables**. Un partenaire ne perd
   pas sa vitrine parce qu'on réorganise un référentiel.
10. **`/admin/villes`** → renommer une ville ayant des annonces.
    **Attendu** : le message annonce **combien d'annonces ont été déplacées**.
    Les annonces portent le nom de leur ville en toutes lettres : sans ce
    déplacement, elles sortiraient de la recherche sans que rien ne le signale.
    Vérifier sur `/recherche` que le filtre trouve bien le nouveau nom.

**Exploitation**

11. **`/admin/journal`**. **Attendu** : les décisions récentes, chacune lue
    « de → à », avec leur auteur. Filtrer par type. **Attendu** : seuls des
    types **réellement présents** sont proposés.
12. Les gestes des étapes 3 et 9 doivent y figurer : le journal est écrit par
    la base, pas par l'interface.
13. **`/admin/rapports`**. **Attendu** : l'**encaissé**, jamais le commandé, et
    la commission présentée comme le seul revenu. Changer de période.
14. **`/admin/feature-flags`** → couper **Messagerie**, en confirmant.
15. Se connecter en client et tenter d'écrire un message. **Attendu** : refus.
    **Les fils existants restent lisibles** — une coupure empêche d'écrire,
    elle n'efface rien.
16. Rallumer l'interrupteur (un seul clic, pas de confirmation : rallumer remet
    le produit dans son état normal). **Attendu** : l'envoi repasse.
17. Couper **Inscriptions partenaires**, puis ouvrir `/pro/inscription` dans un
    onglet privé. **Attendu** : la création de compte partenaire est refusée.
    Rallumer.

**Côté partenaire**

18. **`/pro/equipe`** avec `demo-partenaire@enievent.bj`. **Attendu** : les
    membres et leur rôle en clair. Aucun bouton d'invitation — il dit la marche
    à suivre, parce qu'un collègue doit d'abord créer son compte.
19. **`/pro/documents`** → déposer une pièce. **Attendu** : elle passe « En
    cours de vérification ». Essayer un fichier HEIC : refus expliquant qu'il
    faut le convertir. Essayer un fichier de plus de 8 Mo : refus chiffré.
20. Cliquer **Voir**. **Attendu** : le document s'ouvre. **L'URL est signée et
    expire en une minute** : la recopier et la rouvrir plus tard doit échouer.
    C'est le point à vérifier — le seau est privé, contrairement à celui des
    photos.
21. Se connecter avec un compte **équipier** de la même structure.
    **Attendu** : il consulte l'avancement mais n'a aucun bouton de dépôt.

> ⚠️ Le contrôle qui compte à l'étape 15 : la coupure est appliquée **par un
> déclencheur en base**, pas par l'interface. Un interrupteur qui ne ferait que
> cacher un bouton laisserait passer tout appel direct.

## 15. Écrans à venir

Cliquer n'importe quelle entrée de menu non encore construite — par exemple
**Promotions**, **Journal d'audit** ou **Utilisateurs**.
**Attendu** : une page qui nomme le lot livrant cet écran, et non un 404.

L'état exact — ce qui est livré, ce qui reste, dans quel ordre — est dans
`docs/LOTS.md`.

## 16. Inscription réelle, et les liens reçus par courriel

1. Se déconnecter, ouvrir `/inscription`.
2. Onglet **Particulier** : renseigner un e-mail neuf, un mot de passe de
   10 caractères minimum. **Attendu** : pas de session ouverte, mais l'écran
   « Vérifiez votre boîte mail ». La confirmation d'adresse est active.
3. Cliquer le lien reçu. **Attendu** : on arrive sur **l'accueil**, connecté, le
   prénom visible dans l'en-tête — et non sur `/compte`, qui serait vide : ce
   client n'a encore rien réservé. Son espace reste à un clic.
4. **Ouvrir le lien sur un autre appareil** (téléphone, ou l'application Gmail
   qui ouvre son propre navigateur). **Attendu** : il fonctionne aussi. C'est le
   contrôle qui compte — un lien qui n'aboutit que sur le navigateur d'origine
   est le symptôme du gabarit `{{ .ConfirmationURL }}`, banni du dépôt.
5. Recommencer l'inscription **avec la même adresse**. **Attendu** : un message
   qui dit que l'adresse est déjà utilisée et propose de se connecter. Supabase
   renvoie ici un succès silencieux (protection contre l'énumération de
   comptes) : sans cet écran, l'utilisateur attend un courriel qui ne viendra
   jamais. Vérifier aussi qu'une adresse déjà prise **dans un autre espace**
   (client, pro, entreprise) est signalée de la même façon.
6. Cliquer **l'œil** dans le champ de mot de passe : la saisie devient lisible,
   et le champ ne perd pas le focus.
7. Soumettre un formulaire avec deux champs fautifs. **Attendu** : les deux
   cadres passent au **rouge**, et la page se déplace sur le **premier fautif
   dans l'ordre de l'écran** — pas sur le dernier, pas en pied de page.
8. Ouvrir `/pro/inscription`, saisir le téléphone `97 00 00 01`.
   **Attendu** : refus — c'est l'ancien format à 8 chiffres, plus composable
   depuis le 30 novembre 2024.
9. Saisir `01 97 00 00 01` : accepté. Le compte, l'organisation partenaire et la
   fiche prestataire sont créés ensemble ; le tableau de bord affiche le nom de
   la structure.

**Mot de passe oublié**

10. Sur `/connexion`, **Mot de passe oublié**, saisir une adresse existante.
11. Ouvrir le courriel reçu et cliquer le bouton. **Attendu** : le formulaire de
    nouveau mot de passe s'ouvre réellement. Si « Ce lien n'est plus valable »
    apparaît sur un lien reçu à l'instant, c'est le gabarit qu'il faut regarder,
    pas la durée d'expiration.
12. Définir un nouveau mot de passe, puis se connecter avec. **Attendu** :
    l'ancien ne fonctionne plus.
13. Recliquer le **même** lien. **Attendu** : refusé — un lien de
    réinitialisation ne sert qu'une fois.

## 17. Mobile

Refaire les chapitres 1, 2, 4, 7, 8, 9, 10 et 12 dans une fenêtre de
**390 px de large**.
**Attendu** : les filtres se replient derrière un bouton « Afficher », aucun
débordement horizontal, le calendrier reste dans l'écran, et la barre d'action
du planning reste collée en bas — la sélection se fait en haut de l'écran, les
boutons doivent rester atteignables sans remonter.

---

## 18. Expiration des sessions

1. Se connecter en administrateur, ouvrir `/admin`, puis laisser passer plus
   d'une heure sans naviguer. **Attendu** : au retour, redirection vers
   `/connexion` avec le message « Votre session a expiré ».
2. La même session reste valable **quinze jours** ailleurs : c'est l'entrée
   dans `/admin` qui impose l'heure, pas la session elle-même.
3. Dans les outils du navigateur, modifier le cookie `ee-activity` pour en
   repousser la date. **Attendu** : déconnexion immédiate — l'horodatage est
   signé, une valeur bricolée est traitée comme invalide.

> Sans `SESSION_SECRET`, ce chapitre ne s'applique pas : le délai est inactif,
> et c'est voulu — mieux vaut aucune protection qu'une protection simulée.

---

## Vérifications automatiques

```bash
npm run verify             # typecheck + lint + 644 tests
npm run db:verify          # migrations rejouées dans un Postgres jetable, RLS partout
npm run smoke              # contrôles de bout en bout contre le vrai Supabase
npm run smoke:offre        # la boucle partenaire → modération → catalogue, en réel
npm run smoke:planning     # ouverture des dates, prix plancher, cloisonnement
npm run smoke:devis        # appel d'offres : offres scellées, acceptation atomique
npm run smoke:entreprise   # seuil de validation, aval, imputation budgétaire
npm run smoke:photos       # stockage réel : cloisonnement par dossier, URL publique
npm run smoke:commande     # commande, ventilation, échéancier
npm run smoke:paiement     # PAIEMENT RÉEL en bac à sable — refuse une clé de production
npm run smoke:annulation   # annulation, barème, remboursement — nettoie derrière lui
npm run smoke:messagerie   # masquage, seuils, absence de droit de lecture directe
npm run smoke:cloisonnement# chaque compte contre chaque écran, puis SANS navigateur
npm run smoke:ecrans       # rend réellement chaque route avec une session
npm run smoke:email        # ENVOI RÉEL par Resend — exige EMAIL_TEST_TO
```

Trois d'entre eux ne se remplacent par aucun test local, et il faut savoir
pourquoi :

- **`smoke:cloisonnement`** — son second bloc interroge les tables **sans
  navigateur**. C'est la seule barrière devant quelqu'un qui n'en ouvre pas.
- **`smoke:ecrans`** — une fonction qui traverse la frontière serveur → client
  échoue **à l'exécution seulement**. Ni `tsc`, ni `eslint`, ni `next build` ne
  la voient : ces pages sont dynamiques et ne sont jamais prérendues.
- **`smoke:messagerie`** — PGlite ne reproduit pas les droits par défaut de
  Supabase, qui accorde `SELECT` à `authenticated` sur chaque table neuve. Un
  test local « cette table n'est pas lisible » passe sans rien prouver.

`npm run smoke:sms` existe encore mais **le canal est débranché** (migration
0035) : il ne sert qu'à un éventuel retour en arrière, et consomme un crédit.

---

## Volontairement absent à ce stade

Pour éviter de chercher ce qui n'existe pas encore. Les entrées de menu
correspondantes affichent un écran nommant leur lot, pas un 404.

| Absent | Arrive au |
|---|---|
| Avis et notes — donc pas de classement « les mieux notés » | Lot A |
| Litiges et médiation | Lot A |
| Factures PDF : partenaire, entreprise, client | Lot B |
| Entreprise : réservations et rapports de dépenses | Lot B |
| Invitation d'un collègue par courriel (l'écran Équipe existe, l'envoi non) | Lot D |
| Favoris, documents du client | Lot D |
| Créneaux (matin, après-midi, soirée) — le planning ouvre à la journée | Lot D |
| Promotions et codes de réduction | Lot D |
| Statistiques partenaire, aide en ligne | Lot D |
| Pages éditoriales, blog, packs | Lot E |
| Recadrage et compression des photos côté navigateur | Lot E |
| Purge du cache CDN à la suppression d'une photo (une heure d'écart) | Lot E |
| Pièces jointes et temps réel dans la messagerie | Lot E |

**Livrés depuis** : paiement et réservation effective, annulation et
remboursement, versements aux partenaires, commission par partenaire,
messagerie client ↔ prestataire, notifications par courriel, pages légales,
et le back-office d'exploitation — comptes, référentiel, journal d'audit,
rapports, interrupteurs, équipe et pièces justificatives du partenaire.

> ⚠️ **Deux limites d'exploitation, pas de code.** FedaPay refuse `/payouts`
> (403) et `/refunds` (401) tant que le compte marchand n'est pas validé :
> versements et remboursements sont des **registres** tenus à la main. Et le
> catalogue de démonstration (6 partenaires fictifs, 15 annonces, numéros
> séquentiels) est encore en ligne — il doit disparaître avant le premier vrai
> client. Voir `docs/LOTS.md`.
