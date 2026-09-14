# Déploiement

Mettre ÉniEvent en ligne sur Vercel. Compter 10 minutes, dont un redéploiement.

## Pourquoi ce document existe

Le `.gitignore` exclut `.env*` — c'est délibéré, les clés n'ont rien à faire sur
GitHub. Conséquence : **Vercel ne reçoit aucune variable depuis le dépôt**, il
faut les saisir à la main. Sans elles, chaque page répond `Internal Server Error`,
y compris les URL inexistantes, car le proxy d'authentification s'exécute avant
tout rendu et refuse de démarrer sans configuration Supabase.

## 1. Variables d'environnement

Vercel → le projet → **Settings → Environment Variables**. Cocher **Production**
(et Preview si vous voulez que les branches fonctionnent aussi).

| Variable | Valeur | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Adresse du projet |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Clé navigateur, bridée par la RLS |
| `NEXT_PUBLIC_SITE_URL` | l'URL du déploiement | Liens absolus, retours d'authentification |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | Webhooks et tâches planifiées **uniquement** |

Les valeurs se trouvent dans votre `.env.local`, et côté Supabase dans
Settings → API Keys.

> ⚠️ `NEXT_PUBLIC_SITE_URL` vaut `http://localhost:3000` en local. Recopiée telle
> quelle, elle renverrait vos visiteurs sur leur propre machine.

> ⚠️ `SUPABASE_SECRET_KEY` contourne la RLS. Elle n'a pas de préfixe
> `NEXT_PUBLIC_` précisément pour ne jamais atteindre le navigateur — ne lui en
> ajoutez pas un.

## 2. Redéployer **sans le cache**

Enregistrer les variables ne suffit pas. Les variables `NEXT_PUBLIC_*` sont
**recopiées dans le code au moment de la compilation**, pas lues à l'exécution :
Next les remplace littéralement pendant le build. Un redéploiement qui réutilise
le cache réutilise donc le code compilé *sans* elles, et l'erreur reste identique
— ce qui donne l'impression que la correction n'a servi à rien.

Deployments → le dernier → **Redeploy**, en **décochant** l'usage du cache.

## 3. Autoriser le domaine côté Supabase

Supabase valide toute URL de retour d'authentification contre une liste blanche,
et ignore silencieusement celles qui n'y figurent pas — l'utilisateur atterrit
alors sur `site_url`, souvent resté en localhost.

Tableau de bord Supabase → **Authentication → URL Configuration** :

- **Site URL** : l'URL du déploiement
- **Redirect URLs** : y ajouter `https://<domaine>/**`, sans retirer les entrées
  `http://localhost:*` qui font vivre le développement local

## 4. Vérifier la base

Le code déployé suppose un schéma à jour. Avant d'annoncer une mise en ligne :

```bash
npm run db:verify   # rejoue les migrations, exige la RLS partout
npm run smoke       # parcours de bout en bout contre le vrai Supabase
```

Le seau de stockage `annonces` doit exister (migration `0016_photos.sql`), sans
quoi l'envoi de photos échoue alors que le reste du site fonctionne.

## 5. Diagnostiquer une panne

Le journal de **build** ne contient jamais la cause d'un `Internal Server Error` :
le build a réussi, sinon rien ne serait en ligne. La panne survient à la requête,
donc dans l'onglet **Logs** (runtime). Ouvrir le site dans un autre onglet pour
provoquer la requête, puis lire la ligne qui apparaît — `src/lib/env.ts` nomme la
variable manquante en clair.

Deux avertissements d'installation sont normaux et sans effet :

- `npm warn deprecated eslint@9…` — ESLint 9 est passé en maintenance. Next 16
  n'exécute plus ESLint pendant `next build` ; c'est un outil de développement.
- `npm warn allow-scripts … unrs-resolver` — npm bloque les scripts
  `postinstall` par défaut. Ce paquet est une dépendance d'ESLint, jamais chargée
  par le build.

### Lire les symptômes

| Symptôme | Cause probable |
|---|---|
| **Toutes** les pages en 500, **y compris une URL inexistante** | Le proxy échoue avant tout rendu : variables absentes |
| Une seule page en 500 | Une requête de cette page : migration manquante |
| 404 sur tout | Le déploiement n'a pas abouti |
| Connexion qui renvoie vers localhost | Liste blanche Supabase (§3) |

La distinction du premier cas est décisive : une URL inexistante n'a aucune page
à rendre. Si elle répond 500 au lieu de 404, l'échec est forcément en amont.
