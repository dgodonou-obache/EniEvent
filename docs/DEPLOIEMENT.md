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
| `SESSION_SECRET` | aléatoire, ≥ 32 octets | Signe l'horodatage d'inactivité — **sans elle, l'expiration de session est inactive** |
| `CRON_SECRET` | aléatoire | Protège `/api/cron/*` |
| `FEDAPAY_SECRET_KEY` | `sk_sandbox_…` / `sk_live_…` | Ouverture et relecture des transactions |
| `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` | `pk_…` | Page de paiement côté navigateur |
| `FEDAPAY_ENVIRONMENT` | `sandbox` ou `live` | Bascule bac à sable / production |
| `FEDAPAY_WEBHOOK_SECRET` | `wh_…` | Authentifie le corps du webhook — voir l'avertissement ci-dessous |
| `RESEND_API_KEY` | `re_…` | Notifications e-mail |
| `EMAIL_FROM` | `ÉniEvent <bonjour@enievent.com>` | Expéditeur — **domaine vérifié obligatoire** |
| `EMAIL_REPLY_TO` | `contact@enievent.com` | Boîte réellement relevée |

Les valeurs se trouvent dans votre `.env.local`, et côté Supabase dans
Settings → API Keys.

**Inutiles en production**, et à ne pas y poser : `DEMO_PASSWORD`, `EMAIL_TEST_TO`,
`SMS_TEST_TO`, `MAIL_USER`, `MAIL_PASS` (outillage local et scripts `smoke:*`), ainsi que
`PREMUX_API_KEY`, `PREMUX_DOMAIN` et `PREMUX_SENDER_ID` — **le canal SMS est débranché**
depuis la migration 0035, tout part par courriel. Ces trois-là ne sont conservées dans
`.env.example` que pour rendre un retour en arrière possible.

> ⚠️ `NEXT_PUBLIC_SITE_URL` vaut `http://localhost:3000` en local. Recopiée telle
> quelle, elle renverrait vos visiteurs sur leur propre machine.

> ⚠️ `SUPABASE_SECRET_KEY` contourne la RLS. Elle n'a pas de préfixe
> `NEXT_PUBLIC_` précisément pour ne jamais atteindre le navigateur — ne lui en
> ajoutez pas un.

> ⚠️ **`FEDAPAY_WEBHOOK_SECRET` est aujourd'hui absente**, FedaPay n'exposant pas ce
> secret par son API. Le corps reçu n'est donc pas authentifié — ce qui ne compromet
> rien, car la règle du dépôt ne s'y fie pas : à réception, `settle_payment` **relit la
> transaction** chez FedaPay avec notre clé secrète, et refuse d'encaisser si le montant
> constaté diffère de celui ouvert. Le webhook est un signal, la relecture est la preuve.

## 1 bis. Où tournent les fonctions

`vercel.json` épingle `"regions": ["cdg1"]` (Paris). Ce n'est pas un détail de confort :
par défaut Vercel exécute en `iad1` (Virginie), alors que le projet Supabase est en
Irlande — chaque requête de page traversait l'Atlantique **deux fois**. Mesuré avant et
après : accueil 1,3–2,3 s → 638 ms médian, `/recherche` ~820 ms → 205 ms. En cas de doute
sur la région réellement servie, lire l'en-tête `X-Vercel-Id` d'une réponse : il nomme la
région d'entrée puis celle d'exécution (`cdg1::iad1::` = mal placé).

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

## 3 bis. Vérifier le domaine chez Resend

Les notifications par e-mail ne partent **que** depuis un domaine vérifié. Un
expéditeur non vérifié donne un `HTTP 403` dont le libellé parle de domaine et
non de clé — on cherche alors du côté de l'authentification, au mauvais endroit.

Resend → **Domains → Add Domain** → `enievent.com`, région **eu-west-1**
(Irlande : la plus proche du Bénin parmi celles proposées, et la même que le
projet Supabase).

Resend rend alors **quatre** enregistrements à créer dans la zone OVH :

| Type | Nom | Valeur |
|---|---|---|
| `TXT` | `resend._domainkey` | la clé publique DKIM fournie (`p=…`) |
| `MX` | `send` | `feedback-smtp.eu-west-1.amazonses.com.` (priorité 10) |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |
| `CNAME` | `rsend` | `send.forge.rmta.net.` |

> ⚠️ **Le point final n'est pas décoratif.** Une cible d'hôte — `MX`, `CNAME` —
> sans point final est traitée par OVH comme **relative à la zone** : elle est
> publiée en `feedback-smtp.eu-west-1.amazonses.com.enievent.com`, un nom qui
> n'existe pas. Rien ne le signale : l'enregistrement est créé sans erreur, la
> vérification Resend reste simplement en attente sans dire pourquoi. Les `TXT`,
> eux, sont des chaînes et non des noms : leur ajouter un point les corromprait.
> Les enregistrements d'OVH se terminent tous par un point — c'est le repère.

> ✅ **Aucun de ces trois n'entre en conflit avec la messagerie OVH.** Resend
> place son MX et son SPF sous le sous-domaine `send.`, jamais sur l'apex : les
> 4 `MX` d'OVH et le `SPF` `v=spf1 include:mx.ovh.com ~all` restent intacts, et
> le sélecteur `resend._domainkey` est distinct de ceux d'OVH.
>
> ⚠️ **Ne jamais ajouter un second SPF sur l'apex.** Un domaine ne peut en
> porter qu'un : deux enregistrements `v=spf1` invalident les deux, et *tout* le
> courrier du domaine — y compris celui d'OVH — part en indésirable. Si un jour
> les deux devaient cohabiter sur l'apex, il faudrait les **fusionner** en une
> seule ligne, pas en ajouter une.
>
> ⚠️ Rappel de `CLAUDE.md` : la zone est chez OVH, pas chez Vercel. **Ne jamais
> déplacer les serveurs de noms** — cela couperait les e-mails sans le moindre
> message d'erreur.

Une fois les enregistrements propagés (quelques minutes à quelques heures),
**Verify DNS Records** dans Resend. Puis, pour éprouver la chaîne réelle :

```bash
npm run smoke:email     # exige EMAIL_TEST_TO dans .env.local
```

C'est le seul contrôle qui répond à la question qu'aucun test simulé ne tranche :
la passerelle accepte-t-elle réellement notre expéditeur.

## 3 ter. DMARC — en place, en observation

SPF et DKIM disent qu'un message est authentique. **DMARC dit quoi faire de ceux qui ne
le sont pas** — sans lui, Gmail et Outlook décident seuls, et un domaine jeune qui envoie
des confirmations d'inscription est exactement le profil qu'ils traitent avec méfiance.

L'enregistrement est publié dans la zone OVH :

| Type | Nom | Valeur |
|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:contact@enievent.com; adkim=r; aspf=r` |

> ⚠️ **OVH ajoute la zone aux noms de sous-domaine.** Saisir `_dmarc.enievent.com` dans
> le champ publie `_dmarc.enievent.com.enievent.com`, que personne n'interroge jamais.
> Le champ attend `_dmarc`, rien de plus. Même piège que le point final des cibles `MX`
> et `CNAME` (§3 bis).

`p=none` **n'applique aucune sanction** : c'est un poste d'observation. Les rapports
arrivent sur `contact@enievent.com` et disent qui envoie au nom du domaine. Durcir en
`p=quarantine` ne se fait qu'après avoir lu ces rapports plusieurs semaines et vérifié
qu'aucun envoi légitime n'échoue — un durcissement prématuré met les confirmations
d'inscription en indésirable, et le symptôme est silencieux. `adkim=r` / `aspf=r`
(alignement souple) sont nécessaires : Resend signe sous `send.enievent.com`, un
alignement strict rejetterait ses messages.

Vérifier depuis n'importe quelle machine :

```bash
nslookup -type=TXT _dmarc.enievent.com
```

## 3 quater. Les e-mails d'authentification ne partent pas de notre code

Confirmation d'adresse, mot de passe oublié, lien de connexion : ces trois-là partent de
**Supabase Auth**, pas de `src/lib/mail/resend.ts`. Deux conséquences à ne pas manquer.

**Le SMTP se règle chez Supabase**, Authentication → Emails → SMTP Settings :
`smtp.resend.com` port 465, utilisateur `resend`, mot de passe = une clé Resend,
expéditeur `ÉniEvent <contact@enievent.com>`. Sans ce réglage, Supabase emploie son
expéditeur partagé, plafonné à quelques messages par heure et mal réputé — des
inscriptions n'aboutissent jamais, sans erreur visible nulle part.

**Les gabarits vivent dans le dépôt** (`src/lib/notify/auth-emails.ts`) et se publient :

```bash
npm run mails:auth                 # simulation : affiche ce qui changerait
npm run mails:auth -- --appliquer  # publie réellement chez Supabase
```

Les modifier dans l'interface Supabase est une fausse bonne idée : la prochaine
publication les écrase. Le dépôt est la source de vérité.

> ⚠️ Une clé Resend **restreinte à l'envoi** ne permet pas de lire les journaux. Pour
> diagnostiquer une non-réception, il faut une clé de lecture — ou l'interface Resend.

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
