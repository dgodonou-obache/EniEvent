# ÉniEvent V2 — Guide du dépôt

Plateforme de réservation événementielle **au Bénin** (Cotonou, Porto-Novo,
Abomey-Calavi, Ouidah, Parakou…). Marketplace multi-catégories à **double tunnel** :
réservation immédiate pour les prestations simples, appel d'offres pour les événements
complexes.

Le schéma reste multi-pays et multi-devise (`organizations.country`, `cities.country`,
`money.ts`) : ouvrir un pays voisin demandera des données, pas une migration. Mais toute
la copie, les formulaires et les données de démonstration sont béninois.

**Faits béninois à respecter :** numéros à 10 chiffres préfixés `01` depuis le
30 novembre 2024 (`+229 01 97 XX XX XX`) — voir `src/lib/validation/phone.ts` ;
mobile money = MTN MoMo, Moov Money, Celtiis Cash (**ni Wave, ni Orange Money**) ;
devise XOF ; registres RCCM et IFU.

**Où en est le produit : `docs/LOTS.md`** — ce qui est livré, ce qui reste, et dans quel
ordre. C'est le seul document à lire pour savoir quoi construire ensuite ; les anciens
plans de `~/.claude/plans/` décrivent des lots déjà livrés et ne font plus foi.

Cette V2 remplace l'app v1 située dans `..\ÉniEvent` (lecture seule, source de reprise).

## Stack

Next.js 16 (App Router, RSC, Server Actions) · React 19 · TypeScript strict ·
Tailwind 3.4 · Supabase (Postgres, Auth, Storage, RLS) · Zod + react-hook-form ·
**FedaPay** (Mobile Money, carte — bac à sable) · **Premux** (SMS, **débranché**) ·
**Resend** (e-mail, branché) · Vitest.

## Production

Le site tourne sur **https://enievent.com** (apex ; `www` y redirige en 308).
`eni-event.vercel.app` reste servi et sert de cible aux appels internes — sonnerie
`pg_net` et filet GitHub Actions — pour qu'ils ne dépendent d'aucun DNS.

La zone DNS est chez **OVH**, pas chez Vercel : seuls les enregistrements `A` pointent
vers Vercel. Les 4 `MX`, le `SPF` et les 2 `CNAME` DKIM font vivre la messagerie du
domaine. **Ne jamais déplacer les serveurs de noms** — cela couperait les e-mails sans
le moindre message d'erreur.

Mise en ligne, variables à poser, lecture des pannes : `docs/DEPLOIEMENT.md`.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement — **vérifier le port annoncé**, le 3000 est souvent pris |
| `npm run verify` | typecheck + lint + tests — **à passer avant tout commit** |
| `npm run db:verify` | Rejoue les migrations dans un Postgres jetable (PGlite) et exige la RLS partout |
| `npm run db:types` | Régénère `src/types/database.ts` après une migration |
| `npm run db:seed` | Applique `supabase/seed.sql` (rejouable) |
| `npm run demo:reset` | Seed + comptes de démonstration + jeu entreprise |
| `npm run smoke` | Contrôles de bout en bout contre le vrai Supabase |
| `npm run smoke:sms` | **Envoie un vrai SMS** via Premux — canal débranché (0035), ne sert qu'à un éventuel retour en arrière |
| `npm run smoke:email` | **Envoie un vrai e-mail** via Resend — exige `EMAIL_TEST_TO` |
| `npm run mails:auth` | Publie les gabarits d'authentification chez Supabase — simulation sans `-- --appliquer` |
| `npm run smoke:paiement` | **Ouvre un vrai paiement** chez FedaPay — refuse de tourner sur une clé de production |
| `npm run smoke:messagerie` | Ouvre un fil, écrit des deux côtés, vérifie le masquage — **seul endroit où se teste l'absence de droit direct** |
| `npm run smoke:annulation` | Réserve, encaisse, annule et rembourse contre le vrai Supabase — nettoie derrière lui |
| `npm run smoke:avis` | Dépose un avis, y répond, le signale, le rétablit, ouvre un litige — **seul endroit où se vérifient les droits de colonne de `reviews`** ; nettoie derrière lui |
| `npm run smoke:inactivite` | Rejoue la déconnexion par inactivité dans les cinq espaces, horodatage expiré forgé — **le seul contrôle qui attrape une Server Action rompue par le proxy** |
| `npm run smoke:cloisonnement` | Rejoue l'attaque du §4 : chaque compte contre chaque écran d'administration, **puis sans navigateur** |
| `npm run smoke:ecrans` | Rend réellement chaque route avec une session — le seul contrôle qui attrape une erreur de sérialisation RSC |
| `npm run admin:creer` | Crée un compte d'administration sur le vrai projet |

Les autres `smoke:*` (`offre`, `planning`, `devis`, `entreprise`, `photos`, `commande`)
jouent un parcours métier contre le vrai Supabase.

Recette manuelle : `docs/RECETTE.md`.

> ⚠️ La **confirmation d'e-mail est active**. Une inscription n'ouvre pas de session :
> le formulaire affiche « Vérifiez votre boîte mail ». Ces envois partent de
> **Supabase Auth**, pas de notre code — par le SMTP de Resend (`smtp.resend.com:465`,
> utilisateur `resend`), expéditeur `ÉniEvent <contact@enievent.com>`. Leurs gabarits
> vivent dans `src/lib/notify/auth-emails.ts` et se publient par `npm run mails:auth`.
>
> ⚠️ Le mot de passe des comptes de démonstration vit dans `DEMO_PASSWORD`
> (`.env.local`), **jamais dans le dépôt** : `demo-admin` est de type `admin`, et le
> dépôt est public. Aucun repli codé en dur — un repli, c'est le secret qui revient par
> la porte de service.

## Architecture

```
src/proxy.ts            garde d'authentification (ex-middleware.ts, renommé en Next 16)
src/app/(public)/       vitrine, SEO, pages légales
src/app/(marketplace)/  recherche, catalogues, fiches annonce
src/app/(auth)/         connexion / inscription grand public
src/app/(account)/      espace particulier   — /compte, /projets
src/app/(company)/      espace entreprise    — /entreprise
src/app/(partner)/      espace partenaire    — /pro   (sous-groupes (auth) et (dashboard))
src/app/(admin)/        back-office          — /admin
src/lib/                modules métier (voir ci-dessous)
src/utils/supabase/     clients navigateur / serveur / middleware
supabase/migrations/    schéma, une migration par domaine
```

## Règles impératives

### 1. Argent
- Tout montant transite par `src/lib/money.ts` : **entiers en unité mineure**, jamais de
  flottant, jamais de `number` nu. Le XOF n'a pas de décimale, le GHS en a deux —
  `money.ts` porte cette différence, le reste du code l'ignore.
- Toute ventilation (commission entre réservations, acompte entre prestataires,
  remboursement entre lignes) passe par `allocate()` : une règle de trois arrondie ligne
  à ligne perd des francs.
- Les modules à risque financier (`pricing`, `fees`, `promo`, `cancellation`, `escrow`)
  sont couverts par des tests unitaires. Une modification sans test est un refus de revue.
- ⚠️ **Une annonce qu'aucun humain ne peut honorer ne porte jamais `booking_mode`
  `instant` ou `both`.** Sept annonces du jeu de démonstration les portaient après
  l'ouverture des paiements réels, dont trois avec des dates ouvertes jusqu'à 450 000 F —
  pour des villas qui n'existent pas, chez des organisations **sans aucun membre** :
  personne n'aurait honoré la prestation ni même vu la commande arriver. Rien dans le
  code ne s'y opposait, et c'est le point : du point de vue de `book_listing` tout était
  en règle — annonce publiée, date ouverte, tarif renseigné, barème présent. La
  migration 0051 les a passées sur **devis**, ce qui ferme le chemin vers l'argent sans
  vider la vitrine, **et `supabase/seed.sql` avec elles** : une correction que le prochain
  `demo:reset` défait n'est pas une correction. `tests/seed.test.ts` refuse le retour de
  ces deux valeurs et vérifie que la base refuse réellement une réservation. Les dates
  restent ouvertes exprès — elles font vivre le calendrier et le filtre par dates.
  `smoke:annulation`, qui a besoin du tunnel immédiat, l'ouvre lui-même et le referme
  dans un `finally`.
- ⚠️ **Le client paie le prix affiché. Aucun frais, jamais.** La plateforme se rémunère
  uniquement sur la **commission du partenaire**, prélevée sur sa part à l'encaissement
  et donc invisible côté client. Les frais acheteur de la migration 0029 ont été
  **retirés** (0034), pas ramenés à zéro : un réglage qu'on peut rouvrir est un piège —
  le jour où quelqu'un le remonte, le client paie une somme que `BookingBox` ne lui a
  jamais montrée. `quote()` rend donc `total === subtotal`, et un test l'exige.
- **La commission se décide partenaire par partenaire**, depuis `/admin/partenaires`.
  `partner_profiles.commission_rate_override` l'emporte sur `commission_rate_default`
  (`app.commission_rate`). ⚠️ L'écriture passe **obligatoirement** par
  `set_commission_rate` : la migration 0021 a retiré cette colonne du `grant update` de
  `authenticated`, et un administrateur est lui aussi `authenticated` — un droit de
  colonne ne sait pas les distinguer, seul `app.is_admin()` le peut. Un `update` direct
  ne lèverait rien et toucherait zéro ligne. Un champ vide n'est pas un taux de zéro :
  l'un suit le barème général, l'autre est une décision.
- ⚠️ **On ne verse au partenaire qu'après la prestation, et on n'annule qu'avant.** Les
  deux règles sont complémentaires : elles rendent impossible de rembourser un client
  avec de l'argent déjà parti. `payments.payout_id` empêchait de payer *deux fois* ;
  rien n'empêchait de payer *trop tôt*, et un acompte réglé trois mois avant un mariage
  était versable le jour même. `app.order_payout_ready` tranche (migration 0032) ; une
  commande annulée devient versable **immédiatement**, l'annulation étant définitive.
- **Le barème d'annulation porte sur le total, le remboursement sur ce qui a été payé.**
  « La moitié du montant reste due » décrit ce que le partenaire garde. On retient donc
  `total × (100 − taux)`, **plafonné à l'encaissé**, et on rend le reste : la plateforme
  n'émet aucune créance sur un client, n'ayant aucun moyen de la recouvrer. Un partenaire
  qui se désiste rembourse en revanche **intégralement** — le barème le protège du
  changement d'avis du client, pas de sa propre défaillance.
- Le barème est **figé sur la commande** (`orders.cancellation_policy_id`), comme
  `commission_rate` : les conditions du partenaire peuvent changer, celles d'une
  réservation déjà passée non. Et une annonce en porte **toujours** un (migration 0033) :
  sans cela, un remboursement appliquait des conditions jamais affichées au client.
- `src/lib/cancellation.ts` double `app.refund_percent` pour que l'écran annonce la somme
  **avant** confirmation ; `tests/rls-remboursements.test.ts` compare les deux barèmes
  jour par jour sur leurs bornes. Une divergence, c'est un litige.
- ⚠️ **Une échéance ne naît jamais déjà échue** (migration 0052). `event_date -
  days_before` n'était confronté à rien : un devis accepté le 20 octobre pour un
  événement du 22, chez un partenaire qui demande le solde « 7 jours avant », posait un
  « Solde — à régler le 16 octobre » le jour même de la réservation (CMD-202610-000141).
  Le client lit une date passée comme une panne, et il a raison ; pire, `start_payment`
  impose l'ordre des échéances, donc il aurait réglé l'acompte pour se retrouver aussitôt
  « en retard » sur le reste, **sans aucun chemin pour ne pas l'être**. La règle :
  **ce qui est déjà exigible le jour de la réservation est fondu en un seul règlement, dû
  immédiatement** — et quand il ne reste rien derrière, cela donne un paiement intégral,
  qui est aussi la seule façon honnête de tenir une prestation imminente. La fusion
  **additionne** des montants déjà arrêtés : la somme reste le total par construction, et
  le solde continue de n'être jamais calculé. Ne pas confondre avec un **retard survenu
  après** la réservation, qui est un vrai retard de paiement et que l'écran affiche déjà
  comme tel : le défaut était à la naissance. `src/lib/fees.ts` porte la même règle —
  sans `bookingDate` il n'a aucun présent à opposer aux dates et ne fusionne rien, ce qui
  est le cas de l'aperçu de `ScheduleEditor`.
- ⚠️ **Le plancher et le plafond d'un tarif ne partagent pas la même référence**
  (migration 0054). Les deux se déduisaient de `listings.price_from`, qui est un
  **minimum** — `min(pricing_rules.base_price)`, le « à partir de » du catalogue. Bâtir
  un maximum sur un minimum donne une bande qui se referme toute seule : une règle à
  500 F posée sur « Jardin de Fidjrossè » pour éprouver les paiements réels a fait tomber
  son plafond à **2 500 F**, alors que son calendrier portait au même instant 125 dates à
  100 000 F et 6 à 150 000 F. La bande contredisait les données de l'annonce qu'elle
  prétendait protéger, **et il n'y avait pas de retour** : chaque baisse rabaissait le
  plafond, et le plafond interdisait de remonter. Le plancher reste donc sur le tarif
  d'entrée ; le plafond passe sur le **sommet** de ce que l'annonce pratique déjà —
  `greatest(price_from, max(pricing_rules.base_price), max(availabilities.price))`.
  ⚠️ Le déclencheur est `before` : la ligne en cours d'écriture ne compte pas dans ce
  maximum, sans quoi tout tarif se justifierait lui-même. La bande **suit** l'annonce,
  donc elle bouge : une date ouverte au plafond élargit le plafond suivant, et un
  partenaire décidé monte par paliers de cinq. C'est assumé — elle attrape **un doigt qui
  glisse**, pas une politique tarifaire. `tests/rls-bande-de-prix.test.ts` éprouve les
  deux bornes en base et les compare à `priceBand`.
- ⚠️ **FedaPay refuse `/payouts` (403) et `/refunds` (401)** sur ce compte, avec la clé
  même qui obtient 200 sur `/transactions` : virements et remboursements demandent un
  compte marchand validé. Les deux sont donc des **registres** — `mark_payout_sent` et
  `mark_refund_sent` sont les seules fonctions à remplacer le jour où le droit s'ouvre.
  `npm run fedapay:verifier` dit si ce droit est ouvert, sans rien créer.
- ⚠️ **Le passage en argent réel est fermé par défaut.** `liveBlocker`
  (`src/lib/payments/fedapay.ts`) refuse d'**ouvrir** un paiement en production tant que
  `FEDAPAY_WEBHOOK_SECRET` manque, et le webhook répond alors 401. Le refus porte sur
  l'ouverture, en amont : une transaction réelle déjà payée que rien chez nous ne saurait
  dénouer serait bien pire qu'un paiement qui ne s'ouvre pas. Sans ce secret, le corps du
  webhook n'est authentifié par personne et n'importe qui peut nous faire relire les
  transactions de son choix — la relecture reste la preuve, mais une garantie qui tient
  par un seul fil n'en est pas une.
- ⚠️ **Aucune variable `NEXT_PUBLIC_` pour FedaPay.** Le tunnel est entièrement serveur :
  la page de règlement est hébergée par FedaPay, et le navigateur n'y va que par une
  adresse que le serveur a obtenue. Une case « clé publique » à remplir sous une clé
  secrète est une invitation à se tromper de ligne, et ce qui porte `NEXT_PUBLIC_` est
  recopié dans le paquet servi à chaque visiteur — donc public **pour toujours**, même
  après correction. `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` a existé dans la documentation sans
  qu'aucun code ne la lise ; elle a été retirée, et `tests/paiement-production.test.ts`
  interdit son retour.
- **Avant tout encaissement réel : `npm run fedapay:verifier`.** Lecture seule — aucune
  transaction ouverte, aucun webhook créé, pas un franc déplacé. Il vérifie
  l'environnement résolu, l'étanchéité du secret (historique git, variables publiques,
  paquet navigateur), la division du XOF, les droits `/payouts` et `/refunds`, et que le
  webhook déclaré pointe bien chez nous et reste actif. **Il n'affiche jamais la clé** :
  un secret recopié dans un journal de terminal est un secret compromis.

### 2. Changements d'état
Aucune transition d'état (réservation, devis, paiement, séquestre) ne se décide côté
client. Server Actions ou fonctions Postgres `SECURITY DEFINER` uniquement, journalisées
dans `audit_logs`. Les transitions autorisées vivent dans `src/lib/states.ts`.

⚠️ **Un interrupteur qui ne commande rien est pire que pas d'interrupteur.** L'exploitant
le bascule, croit avoir agi, et le produit continue comme avant — jusqu'à la réclamation.
`feature_flags` (migration 0040) ne porte donc que des clés **réellement obéies**, et
l'obéissance vit dans un **déclencheur sur la table**, jamais dans une Server Action ni en
tête d'une fonction d'écriture : garder l'entrée de la table couvre tous les chemins, y
compris ceux qu'on oublie. `conversations` en avait trois — `open_conversation`,
`open_conversation_for_request` et la console — et un interrupteur qui ferme deux portes
sur trois ne ferme rien. **Ajouter une clé demande d'écrire d'abord l'endroit qui lui
obéit**, et `tests/rls-administration.test.ts` vérifie la coupure en base, pas à l'écran.
`app.feature_enabled` rend **vrai** pour une clé absente : un interrupteur qu'on n'a pas
posé n'éteint pas une fonctionnalité qui marchait.

### 3. Sécurité
- ⚠️ **PGlite ne reproduit pas les droits par défaut de Supabase.** Sur le vrai projet,
  un `alter default privileges` accorde `INSERT, SELECT, UPDATE, DELETE` à `anon` et
  `authenticated` sur **chaque table neuve** de `public`. Un test « cette table n'est pas
  lisible » passe donc en local sans rien prouver — constaté sur `messages` (migration
  0038), où le corps brut était servi malgré un commentaire affirmant l'inverse. La RLS
  sauvait la mise, mais une garantie qui tient par un seul fil n'en est pas une. Toute
  table qui ne doit **pas** être lue directement porte un `revoke` explicite, et le
  contrôle se fait dans un `smoke:*`, jamais dans un test PGlite.
- **RLS activée sur toutes les tables**, sans exception. `npm run db:verify` échoue si
  une table de `public` n'a pas la RLS, ou l'a sans aucune politique.
- Toute politique nouvelle ou modifiée s'accompagne d'un test dans `tests/rls-*.test.ts`.
  Ces tests rejouent les migrations dans un Postgres jetable (PGlite) et interrogent la
  base **en se faisant passer pour un utilisateur** (`actingAs`) — une requête lancée en
  superutilisateur contourne la RLS et ne prouve rien.
- ⚠️ **Un UPDATE ou DELETE bloqué par une clause `USING` ne lève aucune erreur** : la
  ligne est invisible, la requête réussit en touchant 0 ligne. Toujours vérifier le
  nombre de lignes affectées, jamais seulement `if (error)`. Seule une clause
  `WITH CHECK` (INSERT, ou UPDATE sortant du périmètre) déclenche une vraie erreur.
- ⚠️ **La RLS dit quelles _lignes_ on peut modifier, jamais quelles _colonnes_.** Une
  politique `using (id = auth.uid())` laisse écrire tout ce que les droits de colonne
  autorisent. Trois élévations de privilèges en découlaient, dont un simple utilisateur
  se promouvant `admin` en un appel (migration 0021). Toute colonne qui **définit un
  privilège** — `account_type`, `is_verified`, `status`, `role`, une commission — se
  protège par un `grant` de colonne **et** un déclencheur de garde, jamais par la seule
  RLS. Exception : un administrateur est lui aussi `authenticated`, donc un `grant` ne
  sait pas l'en distinguer ; là où seul l'administrateur doit écrire (`kyc_documents`),
  c'est la RLS qui tranche, pas les colonnes.
- **Corollaire : une colonne de privilège n'est écrite par personne tant qu'on ne lui a
  pas ouvert une porte.** Les trois de la migration 0021 en ont une depuis la 0040 —
  `set_account_type`, `set_org_status`, `set_feature_flag`, sur le moule de
  `set_commission_rate`. Un `update` direct, **même lancé par un administrateur**, ne
  lève rien et ne touche aucune ligne : c'est le cas silencieux ci-dessus. Deux verrous
  à ne pas retirer de `set_account_type` : on ne se retire pas à soi-même
  l'administration, et on ne rétrograde pas le dernier administrateur — `/admin` étant
  refusé dans le proxy, la porte se refermerait sans clé.
- ⚠️ **`revoke select (colonne)` ne retire rien à un `grant select` de table.** Postgres
  accepte l'ordre sans erreur et sans effet : un `revoke` par colonne ne mord que sur un
  `grant` par colonne. Constaté sur `organization_invitations.token` (migration 0042), où
  le jeton restait lisible par le propriétaire de la structure — et sur
  `organizations.phone` avant lui (0036). **La seule forme qui marche est l'énumération
  positive** : `revoke select on T from authenticated`, puis
  `grant select (col1, col2, …) on T to authenticated`. Corollaire de terrain : `select *`
  cesse alors de fonctionner pour tout le monde, y compris dans les tests — c'est le
  comportement voulu, pas une régression.
- ⚠️ **Le contrôle d'une colonne refermée se fait en la demandant par son nom.** Une fois
  retirée du `grant`, elle ne sort plus d'un `select *` — un contrôle écrit ainsi passe au
  vert **pour la mauvaise raison**, et resterait vert si on la remettait. §4 de
  `smoke:cloisonnement` interroge donc les six colonnes secrètes nommément
  (`commission_rate_override`, `contact_phone`, `organizations.phone`, `billing_email`,
  `token`, `reviews.hidden_reason`), pour chaque profil **et** pour le visiteur. Ajouter
  une colonne sensible demande d'ajouter sa ligne là.
- ⚠️ **Le même piège existe au verbe `update`, et il y est pire.** `0003_catalogue.sql:597`
  accordait `insert, update, delete` sur **treize tables d'un coup**, dont `listings`.
  Combiné à `listings_update`, qui ouvre la ligne entière au propriétaire, un partenaire
  écrivait sa propre note : `update listings set rating_avg = 5` passait, sans erreur et
  sans trace. `partner_profiles` avait été protégé pour ces colonnes exactement par la
  migration 0021 ; `listings` porte les deux mêmes et avait été oubliée. La migration 0047
  énumère donc ses colonnes écrivables et en retire les **cinq colonnes dérivées** —
  `rating_avg`, `rating_count`, `price_from`, `price_from_unit`, `published_at` — toutes
  écrites par un déclencheur et par rien dans `src/`. **Une colonne qu'un déclencheur
  calcule n'est jamais dans un `grant update`** : ce n'est pas une donnée de l'utilisateur,
  c'est un jugement porté sur lui ou une dérivée de ses tarifs. §5 de
  `smoke:cloisonnement` tente l'écriture depuis chaque compte et vérifie, **avec la clé de
  service**, que la valeur n'a atterri nulle part — un `update` masqué par la RLS ne lève
  rien et un `if (error)` seul ne prouverait donc rien.
- ⚠️ **Un déclencheur qui écrit une colonne refermée doit pouvoir passer.**
  `app.refresh_ratings` est `security definer` et ignore les droits de colonne, mais
  **pas** le déclencheur de garde : `auth.uid()` ne change pas en entrant dans une
  fonction `security definer`, il vaut toujours l'identifiant du client qui dépose son
  avis. D'où `app.recalcul_en_cours()`, un drapeau de session (`set local app.recalcul`)
  posé par le recalcul et par lui seul. Ne pas le remplacer par `app.is_admin()` : le
  recalcul n'est pas une action d'administration.
- ⚠️ **Aucune destination venue de l'URL ne se filtre à la main.** Tout passe par
  `safeInternalPath` (`src/lib/validation/redirect.ts`). Le contrôle
  `startsWith("/") && !startsWith("//")`, recopié dans **cinq** fichiers, se laissait
  franchir par `/\evil.com` : le parseur traite `\` comme `/` pour http et https, donc la
  chaîne change d'hôte tout en commençant par une barre unique. Un lien partant vraiment
  de `enievent.com` atterrissait sur une fausse page de connexion. **On ne juge pas une
  URL en lisant ses premiers caractères : on la fait analyser, puis on compare l'origine.**
  Un parseur connaît les cas tordus qu'une expression régulière redécouvrira un par un,
  trop tard.
- ⚠️ **Un plafond de débit vit dans un déclencheur de table** (migration 0045), jamais en
  tête d'une Server Action — même raison que les interrupteurs, `messages` a trois chemins
  d'écriture. On **compte les lignes existantes** plutôt que de tenir un compteur : un
  second état finit par diverger, et un compteur faux ne lève aucune erreur. 5 demandes de
  devis/heure et 15/jour, 5 demandes d'assistance/heure, 20 invitations/jour,
  30 messages/heure. `app.hors_plafond()` exempte la clé de service (`auth.uid()` nul :
  cron, webhooks, seeds, `demo:reset`) et l'administration. ⚠️ Un plafond trop serré est
  une panne, pas une protection : les tests éprouvent les **deux** bords. Ce qui est déjà
  couvert par Supabase et qu'on ne refait pas : connexions 30/h, courriels
  d'authentification 30/h, rafraîchissement 150/h.
- ⚠️ **Changer de mot de passe depuis une session ouverte redemande l'ancien**
  (`PasswordForm`, propriété `exigeAncien`). Une session obtenue par lien de courriel
  prouve l'accès à la boîte ; une session simplement ouverte ne prouve que l'accès à
  l'appareil. L'arrivée du lien de réinitialisation en est exemptée, par construction. Ne
  pas activer `security_update_password_require_reauthentication` chez Supabase à la
  place : elle casserait ces deux écrans, qui n'implémentent pas son code à six chiffres.
  La protection contre les mots de passe éventés (HaveIBeenPwned) est **refusée en 402**
  sur le forfait actuel.
- ⚠️ **`auth.users` n'est pas exposé par PostgREST**, et ne doit pas l'être : cette table
  porte les empreintes de mots de passe. Les adresses e-mail n'existent donc **nulle
  part** dans `public` — `profiles` n'en a pas. `admin_users()` en extrait les quatre
  colonnes utiles derrière `app.is_admin()`. Même motif pour les coordonnées fermées par
  la 0036 (`admin_companies()`, `org_contact()`). ⚠️ `auth.users.email` et
  `organizations.billing_email` sont des **`citext`** : une fonction qui les déclare
  `text` sans transtyper échoue à l'appel sur « structure of query does not match
  function result type », un message qui ne nomme pas la colonne fautive.
- ⚠️ **Deux seaux de stockage, deux régimes.** `annonces` est **public** — une vignette
  est vue par des visiteurs non connectés, la signer coûterait un aller-retour par
  image. `justificatifs` (migration 0041) est **privé** : on y dépose des pièces
  d'identité et des RIB, et une URL de seau public n'est protégée que par son obscurité,
  or elle voyage dans les journaux, les caches et les historiques. La lecture s'y fait
  par URL signée d'une minute, émise côté serveur. Ne jamais y construire une URL
  `…/object/public/…`. Dans les deux seaux, le cloisonnement tient au **chemin**
  (`{org_id}/…`) ; `justificatifs` exige en plus le rôle `owner` ou `accountant`.
  ⚠️ **Un seau public ne rend pas son _catalogue_ public.** Les deux chemins sont
  distincts : `/object/public/…` ignore la RLS, l'API `list` **applique** la politique
  `select`. `annonces` était énumérable par un anonyme jusqu'à la migration 0046 — on
  remontait tous les dossiers, donc toutes les photos, y compris celles d'annonces en
  brouillon ou refusées par la modération. Fermer `list` ne touche pas à l'affichage des
  vignettes, et le dépôt n'appelle ni `.list()` ni `getPublicUrl()` : les adresses des
  photos sont stockées en base.
- ⚠️ **Supprimer un compte, c'est anonymiser — pas effacer.** La chaîne
  `profiles → quote_requests → quote_request_items → quotes` est **en cascade** :
  effacer un client emporterait les devis que ses partenaires ont chiffrés, c'est-à-dire
  le travail et l'historique commercial de quelqu'un d'autre. `delete_my_account`
  (migration 0043) applique donc deux régimes — effacement réel **seulement** quand il
  n'y a ni commande, ni devis, ni message ; anonymisation sinon, les pièces comptables
  survivant sans le nom. La fonction ne prend **aucun paramètre** : elle agit sur
  `auth.uid()`, il n'y a donc pas de cible à garder. On ne part pas non plus en laissant
  une prestation à honorer, de l'argent dû dans un sens ou l'autre, une négociation
  ouverte, ou une structure sans personne aux commandes —
  `account_deletion_blockers()` dit lesquels, en clair, **avant** le geste.
  ⚠️ Le bannissement se pose à une **date lointaine finie**, jamais `'infinity'` : avec
  l'infini, l'API d'administration cesse de rendre le compte, qui disparaît de
  `listUsers` et du tableau de bord alors que la ligne est bien là.
- Les sessions expirent par inactivité : **15 minutes**, dans les cinq espaces
  (`src/lib/auth/inactivity.ts`). Horodatage signé en HMAC, pas d'état en base — le
  proxy s'exécute à chaque requête. Sans `SESSION_SECRET`, le délai est inactif : jamais
  de signature vide, qui simulerait une protection.
- ⚠️ **La durée de vie du cookie d'activité n'est pas le délai d'inactivité, et ne doit
  jamais lui être égale.** `ee-activity` portait `maxAge = INACTIVITY.default` : le
  navigateur l'effaçait à l'instant précis où la session aurait dû mourir, et un
  horodatage **absent** vaut « repose-le », pas « déconnecte ». Le délai était donc
  structurellement inatteignable — des sessions de deux semaines passaient, en
  production, alors que les deux constantes étaient justes prises séparément : c'est
  leur **égalité** qui tuait. Le cookie doit survivre largement à ce qu'il mesure
  (`COOKIE_MAX_AGE`), sa présence passé l'échéance étant la seule preuve de
  l'inactivité. `tests/inactivity.test.ts` garde l'écart.
- ⚠️ **Une réponse neuve dans le proxy n'hérite d'aucun `Set-Cookie`.** Une
  `NextResponse.rewrite` ou `redirect` construite après `getUser()` jette l'horodatage
  d'activité **et** le jeton que Supabase vient éventuellement de rafraîchir. Y reporter
  `supabaseResponse.cookies`, sauf quand on coupe la session exprès.
- **Couper une session sans prévenir fait perdre un formulaire à moitié rempli.**
  `SessionTimeout` (`src/components/auth/SessionTimeout.tsx`) avertit 2 minutes avant et
  entretient l'horodatage sur geste réel, via `/api/session` — une page lue n'émet aucune
  requête, et remplir un long formulaire compterait sinon pour de l'inactivité. ⚠️ Cet
  écran n'est **pas** l'autorité : le proxy décide seul, l'avertissement est une
  courtoisie. Une fois la fenêtre ouverte, seul un **clic** prolonge — un mouvement de
  souris la ferait disparaître sans que personne n'ait rien lu.
- ⚠️ **Une déconnexion est une _navigation_, jamais une Server Action.** La coupure pour
  inactivité passait par la Server Action `signOut`, et produisait en production l'écran
  intégré de Next — « This page couldn't load » —, que l'utilisateur lit comme une panne
  d'ÉniEvent. Mesuré en forgeant un horodatage expiré mais correctement signé :

      navigation classique   307 → /pro/connexion?raison=inactivite  puis 200, explication affichée
      Server Action (POST)   307 → rePOST → 404 « Server action not found. »

  **Un 307 conserve la méthode** : le navigateur rejoue le POST sur la page de connexion,
  en-tête `Next-Action` compris, et elle ne connaît pas cette action. Et ce n'était pas un
  cas rare, c'était le **chemin nominal** — le proxy ne repose l'horodatage qu'une fois
  par minute (`REFRESH_AFTER_SECONDS`) et `SessionTimeout` n'appelle `/api/session` qu'une
  fois par minute, si bien que la référence du serveur est structurellement plus ancienne
  que celle du navigateur : quand le compte à rebours atteint zéro, le proxy a déjà
  tranché. La coupure passe donc par `GET /auth/deconnexion?suivant=…`, hors de tout
  espace protégé, ce qui **supprime la course** au lieu de la réduire : le gestionnaire
  s'exécute que la session soit vivante ou déjà coupée. Même raison pour **tout** geste
  qui doit aboutir alors que la session peut être tombée.
- ⚠️ **Chaque espace protégé a son `error.tsx`, et il ne devine pas la cause.** Sans lui,
  c'est l'écran intégré de Next qui s'affiche. `SessionExpiree` interroge `/api/session`
  — `401` signifie qu'il n'y a plus de session — **avant** d'écrire quoi que ce soit :
  annoncer une session expirée sur une vraie panne serait reproduire le défaut dans
  l'autre sens. L'écran renvoie vers la connexion de **son** espace (§4) et **n'annonce
  aucune durée** : le délai se règle en base, une phrase qui le cite finirait par mentir.
  `npm run smoke:inactivite` rejoue tout cela dans les cinq espaces.
- `SUPABASE_SECRET_KEY` : webhooks et tâches planifiées uniquement. Jamais dans un
  composant, jamais dans une Server Action déclenchée par un utilisateur.
- Les webhooks de paiement sont **idempotents** (contrainte unique sur
  `payments.idempotency_key`) et revérifient le montant côté serveur.
- ⚠️ **Un webhook est un signal, jamais une preuve.** FedaPay n'expose pas le secret de
  signature par son API : le corps reçu n'est donc pas authentifié tant que
  `FEDAPAY_WEBHOOK_SECRET` n'est pas renseigné. La règle est de toute façon la bonne —
  à réception, on **relit la transaction** chez le prestataire avec notre clé secrète, et
  c'est cette lecture qui fait foi. `settle_payment` refuse d'encaisser si le montant
  constaté diffère de celui ouvert.
- **Le client ne fournit jamais un montant.** `start_payment` le déduit de la commande,
  elle-même figée à l'acceptation du devis. Revérifier un montant côté serveur n'a aucun
  sens si l'on a laissé le navigateur le choisir au départ.
- ⚠️ **Le montant constaté est `transaction.amount`, jamais ce que le payeur a été
  débité.** Mesuré le 21 octobre 2026 sur une transaction réelle de 150 F : FedaPay a
  demandé **153 F** à MTN, soit 2 % de plus — ses frais sont donc, sur ce compte, **à la
  charge du client**. La transaction porte les deux chiffres dans des champs distincts
  (`amount`, puis `fees` / `amount_debited`), et c'est `amount` que `readTransaction`
  retient : comparer le débit au montant ouvert ferait échouer en base un paiement
  réellement encaissé, et la commande resterait impayée alors que le client a payé — la
  panne la plus coûteuse du tunnel. ⚠️ **Et ce réglage contredit la règle du prix
  affiché** : le client règle 153 F pour une réservation annoncée à 150 F. Il ne se change
  pas dans le dépôt mais dans le tableau de bord de FedaPay (frais à la charge du
  marchand) — où ils viennent en coût d'exploitation sur la commission, sans toucher à la
  part du partenaire, qui est calculée sur le montant de la commande.
- ⚠️ **Un échec de paiement doit dire pourquoi, sans dire qui.** Trois règlements refusés
  le 20 octobre 2026 portaient « État canceled » : exact, et inutile — la vraie cause
  (`COULD_NOT_PERFORM_TRANSACTION`, refus de MTN) n'existait que dans le tableau de bord
  de FedaPay, alors qu'on relit la transaction et qu'on avait donc la réponse sous les
  yeux. Mais le champ qui la contient, `last_error_message`, transporte **toute la charge
  utile de l'opérateur, numéro du payeur compris**, et `payments` est lisible par le
  **partenaire** autant que par le client (`payments_select`, 0026) : y recopier ce
  message publierait le numéro d'un client à son prestataire, durablement, en contournant
  d'un coup tout le masquage de la messagerie. `fedapayErrorCode` applique donc un
  **filtre positif** — ne sort que ce qui a la forme d'un code —, et un message libre est
  écarté en entier, même s'il explique mieux. Le motif ne s'affiche qu'à l'administration
  (`PaymentTable showReason`) : c'est du jargon pour un client, et ce n'est pas l'affaire
  du partenaire.

### 4. Isolation des espaces
Les cinq espaces sont étanches. Un partenaire déconnecté est renvoyé sur
`/pro/connexion`, jamais sur `/connexion` ; aucun lien « retour au site » dans les
back-offices.

**Une exception, assumée et unique : `/compte`.** Un particulier n'est pas un
exploitant — c'est un visiteur de la place de marché qui se trouve connecté. Le renvoyer
chercher un lieu sans se déconnecter est le parcours normal, pas une fuite : son en-tête
porte donc un lien « Explorer » vers `/recherche`
(`src/app/(account)/layout.tsx`). `/pro`, `/entreprise` et `/admin` restent sans porte de
sortie. Même logique dans l'autre sens : un particulier qui vient de confirmer son
adresse atterrit sur `/`, et non sur un espace vide qu'il n'a pas encore rempli
(`src/app/auth/confirm/route.ts`) — un partenaire, lui, a quelque chose à y faire tout de
suite et reste chez lui.

L'autorisation (rôle, appartenance à une organisation) est faite dans le layout serveur
de chaque espace — **sauf `/admin`, refusé dans le proxy**.

⚠️ **Un layout ne bloque pas l'exécution d'une page.** Page et layout se rendent en
parallèle : un layout qui renvoie un refus au lieu de ses enfants empêche l'affichage,
mais la page a déjà tourné, ses requêtes sont parties, et son rendu se retrouve dans la
charge RSC du document. Aucune donnée ne fuyait — la page s'exécute avec les droits du
visiteur, la RLS filtre — mais la première page d'administration employant
`SUPABASE_SECRET_KEY` ou une fonction `SECURITY DEFINER` aurait fui pour de bon. D'où la
réécriture vers `/acces-refuse` depuis le proxy : la page ne s'exécute jamais, et l'URL
ne change pas, ce qui évite de faire croire à une session expirée.

`npm run smoke:cloisonnement` rejoue l'attaque : chaque compte contre chaque écran
d'administration, puis les mêmes tables interrogées **sans navigateur**, puis la
tentative d'auto-promotion. C'est le second bloc qui compte — la RLS est la seule
barrière devant quelqu'un qui n'ouvre pas de navigateur.

### 5. Rédaction destinée aux utilisateurs
- Pas de jargon. Les politiques d'annulation et de paiement se disent en clair :
  « Non remboursable », pas « Annulation stricte » ; « Annulation gratuite jusqu'à 48 h
  avant », pas « Politique flexible ». Interface en français.
- **Aucune preuve sociale fabriquée.** Ni note, ni avis, ni « les plus demandés » tant
  que la donnée n'existe pas : inventer un classement tromperait le client autant que le
  partenaire arbitrairement désigné comme meilleur. Une mise en avant se fonde sur un
  **fait vérifiable ligne à ligne** — la section « Réservez sans attendre » de l'accueil
  s'appuie sur des dates réellement ouvertes **et sur le tunnel immédiat**, et elle est
  donc vide depuis que le catalogue fictif est passé sur devis (0051) ; « Les valeurs
  sûres » exige **au moins trois avis réels** et est vide aussi. Les deux le sont pour la
  même raison, qui est la bonne : leur fait est devenu faux, et un bloc vide vaut mieux
  qu'un bloc rempli de rien.
  **Les favoris suivent la même règle, et la base la rend indiscutable** : aucun compteur
  « 42 personnes ont aimé » n'existe, et `favorites_own` (migration 0042) empêche
  l'agrégat d'être calculé, même par quelqu'un qui écrirait la requête exprès. Ne pas
  ajouter de fonction rendant un nombre de favoris par annonce.
- ⚠️ **Le badge « vérifié » se gagne, et il ne pouvait pas l'être** (migration 0055).
  Mesuré le 5 novembre 2026 : **zéro pièce déposée** dans toute la base, zéro fichier dans
  le coffre, et six partenaires marqués « vérifiés » — les six organisations de
  démonstration, par le *seed*. `is_verified` ayant été retirée du `grant update` par la
  migration 0021, **aucune fonction du dépôt ne pouvait l'écrire** : le badge n'était pas
  mal attribué, il n'existait aucun chemin pour l'attribuer. Et aucun écran
  d'administration ne lisait `kyc_documents`, si bien qu'un partenaire qui déposait ses
  pièces lisait « En cours de vérification » **indéfiniment**. ⚠️ Pire, la coche de la
  **fiche annonce** était **codée en dur** : elle s'affichait pour tout prestataire, sur
  la page même où un acheteur décide de réserver. `review_kyc_document` est désormais la
  seule porte, sur le moule de `set_commission_rate`, et elle **recalcule** le badge
  depuis `app.kyc_validated` au lieu de le décréter — refuser une pièce déjà approuvée
  l'éteint. ⚠️ `insurance` n'entre pas dans les pièces obligatoires : conditionnelle à
  l'écran, l'exiger rendrait tout dossier incomplet à jamais.
- ⚠️ **Une annonce ne devient visible qu'après validation du dossier de son prestataire**
  (migration 0055). Décision d'exploitation du 5 novembre 2026, dans ces termes : « le
  partenaire peut faire sa demande pour publier une annonce, mais l'annonce ne sera
  visible qu'après la validation par ÉniEvent ». Le **dépôt reste libre** — `draft` et
  `pending` ne changent pas —, c'est le passage en `approved` qui exige le dossier, et le
  refus vit dans un **déclencheur de table** : la file de modération écrit
  `listings.status` par un `update` direct, un contrôle posé dans la Server Action serait
  contourné par le premier autre chemin. ⚠️ La condition porte sur `is_verified` et non
  sur les pièces : les deux reviennent au même pour un partenaire réel, mais exiger les
  pièces aurait obligé à **inventer de faux documents en production** pour que le jeu de
  démonstration continue de fonctionner. ⚠️ Les annonces **déjà publiées ne bougent pas** —
  le déclencheur ne regarde que la transition. Et `ModerationCard` annonce le refus
  **avant** le clic, bouton désactivé : proposer un geste que la base refusera fait passer
  un produit pour cassé.
- ⚠️ **Un avis exige une prestation réellement rendue, et rien dans les données ne dit
  qu'elle l'a été.** `order_status` ne connaît que `pending_payment`, `deposit_paid`,
  `paid`, `cancelled`, `refunded` : aucun état ne signifie « réalisée », et **on n'en
  ajoute pas un que personne ne marquerait** — `acceptance_rate` a passé un an en colonne
  morte pour cette raison. L'éligibilité se déduit donc de trois faits vérifiables (la
  commande est celle de l'auteur, un règlement est encaissé,
  `coalesce(end_date, event_date)` est dépassée), imposés par
  `app.guard_review_eligibility` — un **déclencheur**, parce que la RLS dit quelles lignes
  et jamais à quelles conditions. `canReview` (`src/lib/cancellation.ts`) le double à
  l'écran, comme `canCancel` : proposer un formulaire que la base refusera fait passer un
  produit pour cassé.
- ⚠️ **Une note ne pèse sur le classement qu'à partir de trois avis.** Le tri par défaut du
  catalogue est `rating_avg desc` **depuis toujours** : au premier avis déposé, tout le
  catalogue se réordonnait sur une seule opinion, et un unique « 5 » battait une annonce
  notée 4,8 sur cinquante avis. `listing_search.rating_sort` est donc nulle sous le seuil,
  et `nullsFirst: false` range ces annonces après celles qui ont une note établie. La note
  **s'affiche** quand même, et l'écran dit qu'elle ne classe pas encore — une note visible
  qui ne compte pas doit s'expliquer, sinon le partenaire croit à un défaut et le client à
  une note truquée. `RATING_RANK_MIN` ne commande rien : c'est la vue qui tranche, et
  `tests/reviews.test.ts` lit la migration pour vérifier qu'elles disent le même nombre.
- ⚠️ **La signature d'un avis est calculée à l'écriture et stockée.** `profiles` n'est
  lisible que par son propriétaire (`profiles_select_own`, 0002) et il n'est pas question
  de l'ouvrir pour afficher un prénom : `reviews.author_label` porte « Clara G. », jamais
  le nom complet. Elle survit donc à un changement de nom — et un déclencheur sur
  `profiles.deleted_at` la ramène à « Un client » dès qu'un compte est anonymisé, sans
  quoi quelqu'un qui a demandé à être oublié continuerait de signer.
- ⚠️ **UN AVIS NE SE RETIRE PAS. Jamais, pour aucun motif, quelle que soit sa note.**
  Décision d'exploitation du 11 octobre 2026, qui **renverse** celle de la veille, et le
  motif est le bon : *retirer un mauvais avis est un signe de méfiance envers la
  plateforme*. Un visiteur qui ne voit que des éloges n'en conclut pas que les
  prestataires sont bons, il en conclut que le reste a été effacé — et ÉniEvent perd
  exactement ce que les avis devaient lui apporter. **Le recours d'un partenaire est sa
  réponse publique**, et elle seule. La migration 0050 a donc supprimé le retrait sur
  signalement, l'immunité qui le bornait, et les fonctions `hide_review` /
  `reinstate_review` — **supprimées, pas laissées en coquilles** : un appel oublié doit
  échouer, pas réussir sans rien faire. Un signalement est redevenu ce qu'il aurait dû
  être : un signal adressé à l'équipe, qui ne touche à rien. Ne pas reconstruire ce
  mécanisme sans que l'exploitant le demande explicitement.
- ⚠️ **La seule exception porte sur le _texte_, jamais sur la note — et c'est la ligne à
  ne pas déplacer.** Un avis peut contenir autre chose qu'un reproche : une insulte
  nommant un salarié, un numéro de téléphone — qui contournerait d'un coup tout le
  masquage des coordonnées de la messagerie —, l'adresse de quelqu'un. « Un avis reste »
  ne peut pas vouloir dire « ÉniEvent ne peut rien faire de ça ».
  `redact_review_body(avis, motif)` retire donc ce texte-là, et :
  **la note reste comptée** — `app.refresh_ratings` ne filtre plus rien, et c'est la
  garantie centrale : sans elle, « contenu illicite » redeviendrait le moyen de faire
  disparaître un 1/5, et on serait revenu au point de départ par la porte de service ;
  **l'avis reste affiché** avec ses étoiles ; et **le motif est publié à sa place**, lu
  par tous. C'est ce qui sépare une modération assumée d'un effacement — d'où un motif
  écrit *pour le lecteur*, et `redacted_by` (qui a tranché) seul fermé. Le geste est
  journalisé. Jamais pour un avis simplement sévère.
  `tests/rls-avis.test.ts` garde la garantie en réintroduisant le filtre, et
  `smoke:avis` vérifie contre la vraie base que signaler ne retire rien.
- Une **annonce** signalée n'est jamais retirée automatiquement non plus : cela couperait
  les réservations d'un partenaire sur la parole d'un inconnu. Le **plafond de débit** des
  signalements (0049) survit, lui : il borne un volume d'envois, ce qui n'a rien à voir.
- ⚠️ **Un litige ne déplace pas d'argent, et `resolve_dispute` n'en déplacera jamais.** Il
  existe un chemin vers le remboursement — `cancel_order` — qui applique le barème figé
  sur la commande et borne le rendu à l'encaissé (§1). En ouvrir un second serait un
  second endroit où se tromper, et celui-là n'aurait ni barème ni plafond. Trancher en
  faveur du client veut donc dire : annuler depuis `/admin/reservations`, puis **rattacher**
  le remboursement produit, que la fonction vérifie comme portant bien sur cette commande.
  Un litige exige par ailleurs un **règlement encaissé** : sans argent déplacé, le recours
  est l'annulation ou le support, sinon `/admin/litiges` devient une seconde boîte de
  réclamations. Et contrairement à un signalement — caché à sa cible, sans quoi plus
  personne ne signalerait — un litige **se montre aux deux parties** : on ne demande pas à
  quelqu'un de se défendre d'un reproche qu'il ne lit pas.
- ⚠️ **« Pas encore de donnée » et « zéro » ne s'écrivent pas pareil.** Un taux
  d'acceptation à `0 %` se lit comme un jugement — « vous ne convertissez rien » — alors
  que le vrai message est qu'aucun devis n'a encore été tranché. Les statistiques
  partenaire rendent donc `null` et affichent « — », jamais un zéro trompeur. Même
  vigilance pour un taux de remplissage sans date ouverte : c'est un planning vide, pas
  une mauvaise performance, et l'écran le dit.
- ⚠️ **Un reçu n'est pas une facture, et le document doit le dire lui-même.** Une facture
  est une pièce fiscale qui engage un RCCM, un IFU **et une mention de TVA**. Les deux
  premiers sont renseignés dans `legal.ts` depuis le 5 octobre 2026 ; le régime de TVA,
  lui, est une **décision fiscale** et ne se devine pas. `/compte/documents` émet donc
  toujours des **reçus**, qui portent la mention en toutes lettres — quelqu'un qui
  enregistre le PDF et le présente à son comptable ne doit pas avoir à se souvenir d'une
  phrase lue ailleurs. Ne pas basculer sur « facture » au seul motif que l'immatriculation
  existe.
- ⚠️ **L'identité légale n'a pas de capital social, et ce n'est pas un oubli.** ÉniEvent
  est un **établissement** : pas de capital, le patrimoine est celui de l'exploitant. Le
  champ a été **retiré** du modèle plutôt que laissé à `null` — une ligne « Capital
  social : à compléter » aurait promis une information qui n'existera jamais, et `0 F`
  aurait été un faux. Même logique pour `address` : un siège déclaré à la commune
  (« Cotonou, Bénin ») est complet, d'où `registeredOffice()` et son absence de
  `entityIsComplete()`.
- **Ne pas promettre ce qui n'existe pas.** L'accueil affichait 39 métiers dont 27 sans
  la moindre annonce ; il ne montre plus que les familles pourvues, avec leurs comptes.
  Un retour muet est du même ordre : une session expirée ou un lien périmé s'expliquent
  (`SignInNotice`), ils ne renvoient pas silencieusement vers la connexion.

### 6. Interface
- Suivre `.claude/rules/design-system.md` — orange pêche en primaire, teal par touches,
  neutres slate, `rounded-2xl`, ombres douces, `active:scale-[0.98]`, `transition-all`.
- **Jamais** de `<input type="date">` natif : utiliser `CustomDatePicker`.
- ⚠️ **Un fichier `"use server"` ne peut exporter que des fonctions asynchrones.** Une
  constante y est silencieusement retirée du module servi au navigateur : le composant
  client qui l'importe échoue à l'exécution sur « Export X doesn't exist in target
  module ». Ni `tsc` ni `eslint` ne le voient — même famille que la sérialisation RSC,
  et c'est `npm run smoke:ecrans` qui l'attrape. Ce qui doit traverser la frontière vit
  dans un module neutre : `src/lib/validation/` en tient déjà plusieurs, sans
  `server-only`.
- ⚠️ **Un champ caché ne porte jamais une valeur que le clic de soumission modifie.**
  Le clic met l'état à jour, React refait le rendu, **puis** le navigateur sérialise le
  formulaire : le champ vaut alors l'inverse, et le serveur reçoit le contraire de la
  demande. Le cœur des favoris envoyait ainsi `active={String(!actif)}` — premier clic
  sans effet, second clic qui allumait le cœur **sans rien écrire**, la réponse identique
  à la précédente n'entraînant même pas de correction. Ni `tsc`, ni `eslint`, ni les
  tests ne voient cette course. Quand l'état d'arrivée dépend de l'état de départ, la
  bascule se décide **en base**, où la vérité se trouve déjà, et le formulaire ne
  transporte qu'un identifiant. Porter une **sélection** faite plus tôt (des dates, une
  case) reste légitime : `BookingBox` et `PlanningBoard` le font correctement.
  `tests/formulaires-server-actions.test.ts` garde la règle — et ce test a lui-même dû
  être éprouvé en réintroduisant le défaut, sa première version ne l'attrapait pas.
- ⚠️ **Un état qui suit une autre valeur s'ajuste _pendant_ le rendu, pas dans un effet.**
  `react-hooks/set-state-in-effect` refuse le `setState` en corps d'effet, et il a
  raison : l'effet peint d'abord l'ancien état puis le corrige sous les yeux. La forme
  admise est celle que React documente — mémoriser la valeur précédente dans un `useState`
  et la comparer en cours de rendu, React reprenant la passe avant d'afficher. La barre
  latérale s'en sert pour ouvrir la section d'arrivée **au changement de page seulement**,
  sans quoi une section repliée à la main se rouvrirait toute seule.
- **Un retour optimiste ne se remplace pas par un indicateur de chargement.** Mettre un
  sablier à la place du cœur efface précisément ce que la personne attend : elle a cliqué
  pour le voir changer. On montre l'état d'arrivée, atténué tant qu'il n'est pas
  confirmé, et la réponse du serveur tranche — y compris pour revenir en arrière.
- **Un formulaire ne se contente pas de refuser : il montre où.** Tout formulaire validé
  côté serveur passe par `useFieldErrors` (`src/components/ui/use-field-errors.ts`), qui
  encadre les champs fautifs en rouge **et** emmène l'utilisateur au premier d'entre eux,
  dans l'ordre du DOM et non dans celui du schéma Zod. Un message d'erreur en pied de
  page laisse chercher sur un formulaire long ; sur mobile, il est hors écran.
  Tout champ de mot de passe est un `PasswordInput`
  (`src/components/ui/password-input.tsx`), avec son œil : refuser de montrer ce qu'on
  tape ne protège personne et fait échouer des connexions légitimes.
- ⚠️ **Aucune fonction ne traverse la frontière serveur → client** : composant
  d'icône, callback, classe. La sérialisation RSC échoue **à l'exécution
  seulement** — ni `tsc`, ni `eslint`, ni `next build` ne la voient, car ces
  pages sont dynamiques et ne sont jamais prérendues. Un menu passé en propriété
  a rendu les trois back-offices en 500 sans qu'aucun contrôle automatique ne
  le signale. Passer une clé (`space="partner"`) et résoudre côté client.
  Corollaire : **rendre réellement une page authentifiée** avant de la déclarer
  livrée ; un test contre la base ne prouve pas que l'écran s'affiche.
- ⚠️ **Les icônes se régénèrent d'une commande, et un favicon cassé répond 200.**
  `npm run icones` dérive les six fichiers de `public/images/marque-enievent.png` ;
  rien ne les relie entre eux, et en remplacer un à la main donne un onglet et un écran
  d'accueil qui ne portent pas la même marque, sans qu'aucune erreur n'apparaisse. Deux
  pièges mesurés le 15 octobre 2026, tous deux invisibles au code de retour :
  **les PNG empilés dans un `.ico` doivent être en RGBA** — en palette, le décodeur de
  Next refuse (« The PNG is not in RGBA format! ») et **aucune balise `<link rel="icon">`
  n'est émise** pendant que le fichier continue d'être servi ;
  et **iOS ne lit pas le HTML** — lui et les moissonneurs qui alimentent les suggestions
  de recherche tapent `/apple-touch-icon.png` et `/apple-touch-icon-precomposed.png` à la
  racine, qui rendaient un 404 en HTML. D'où un iPhone affichant une marque dans ses
  suggestions et une autre sur le site ouvert. La fin de `smoke:ecrans` garde les quatre
  balises **et** les sept adresses, en exigeant le type de contenu : un 404 de Next rend
  du HTML, et le seul code de retour ne prouverait rien.
- ⚠️ **L'icône qu'un moteur affiche vient de son index, pas de notre serveur.** Mesuré
  le 15 octobre 2026 : le service d'icônes de Google rendait encore un **ancien logo**
  pour `enievent.com` — ni le nôtre, ni celui de Vercel —, et Chrome sur Android montrait
  un globe, son marque-place quand il n'a rien en cache. Aucune purge n'est possible de
  notre côté : le seul levier est la ré-exploration. `src/app/robots.ts` et
  `src/app/sitemap.ts` existent pour cela — et n'existaient pas, alors que le proxy les
  excluait déjà nommément de son filtre, signe qu'on les croyait présents. Le plan se
  construit **depuis la base**, par le client public : la RLS n'expose que les annonces
  validées et non suspendues, c'est-à-dire exactement ce qui doit y figurer, et s'en
  remettre à elle évite de recopier la condition. ⚠️ Une adresse du plan qui **redirige**
  est comptée comme un défaut : une fiche a une seule URL canonique — `/lieux/…` pour un
  lieu, `/prestataires/…` pour un service — et l'autre renvoie un 307. La fin de
  `smoke:ecrans` en échantillonne huit.
- ⚠️ **Pas de `display: "standalone"` dans le manifeste.** Il ferait s'ouvrir le site sans
  barre d'adresse depuis l'écran d'accueil. Sur une plateforme où l'on règle des sommes
  réelles par Mobile Money, l'adresse visible est un repère de confiance — c'est elle qui
  permet de vérifier qu'on est bien sur `enievent.com` avant de payer. « Ça fait plus
  application » n'est pas une raison suffisante pour la retirer.
- ⚠️ **Les en-têtes de sécurité vivent dans `next.config.ts`**, qui était vide jusqu'à
  l'audit du 8 octobre 2026 : la production ne servait que le HSTS de Vercel. `/admin`
  valide des annonces et déclenche des remboursements — rien n'empêchait de l'encadrer
  dans une iframe invisible. `frame-ancestors 'none'` et `X-Frame-Options` ferment le
  détournement de clic ; `nosniff`, `Referrer-Policy` (nos URL portent des références de
  commande) et `Permissions-Policy` complètent. **Pas de CSP complète, et c'est
  délibéré** : elle exige un `nonce` propagé à chaque script de Next, se règle dans le
  proxy et se vérifie écran par écran — posée à l'aveugle elle casse l'hydratation sans
  qu'aucun test ne le voie, puisque le HTML est rendu. C'est un chantier à part. Avant
  d'ajouter `frame-ancestors`, on a vérifié qu'aucune iframe n'existe dans le dépôt.
- Mobile-first, vérifié à 390 px : pas de débordement de modale ni de menu déroulant.
- Zones défilables : `overflow-y-auto no-scrollbar`.
- ⚠️ **Une liste d'exploitation est un tableau, pas une pile de cartes.** `/pro/devis` et
  `/pro/reservations` empilaient des cartes : lisible à trois lignes, illisible à trente,
  et on n'y comparait **rien** — ni deux montants, ni deux dates — parce que rien n'était
  aligné. `DataTable` (`src/components/dashboard/DataTable.tsx`) porte le tri, la
  pagination et le menu de ligne. Trois règles s'y attachent :
  **on trie sur la donnée, jamais sur ce qu'on affiche** — « 900 000 FCFA » se range
  après « 1 100 000 FCFA » en comparaison de chaînes, et « 3 déc. » avant « 5 janv. »,
  sans la moindre erreur visible ; d'où `valeurs` (ce qu'on lit) et `tris` (ce qui
  compare), séparés ;
  **le menu de ligne s'ouvre en position _fixe_** — CSS impose qu'un axe d'`overflow` en
  `auto` force l'autre à `auto`, donc `overflow-x-auto` rogne **aussi en hauteur** et un
  menu en absolu y est coupé net, quel que soit son `z-index` (même famille que
  `backdrop-blur`, `tests/stacking.test.ts`) ;
  **pas de case à cocher** — aucune action de masse n'existe dans ces écrans, et une
  colonne de cases qui ne commande rien est le défaut de l'interrupteur débranché.
  `tests/data-table.test.ts` garde les trois.
- ⚠️ **La devise monte dans l'en-tête — « Montant (FCFA) » —, et seulement si elle est
  unique sur l'écran.** Répétée sur chaque ligne, elle encombre une colonne dont c'est
  justement le rôle de s'aligner. Mais le schéma est **multi-devise** : une colonne
  « Montant (FCFA) » contenant une ligne en GHS afficherait un montant faux sans qu'aucune erreur
  ne se produise. Les pages comptent donc les devises présentes et ne remontent le libellé
  que s'il n'y en a qu'une ; sinon chaque montant reprend la sienne. `currencyLabel`
  (`money.ts`) est le **seul** endroit qui sait que le XOF se dit « FCFA » — la
  correspondance vivait en dur dans `format`, et la recopier dans un en-tête aurait fait
  deux sources qui divergent au premier pays voisin. Une tuile isolée (`StatTile`) garde
  sa devise : rien autour d'elle ne la porte.
- ⚠️ **Une recherche de tableau cherche dans ce qu'on affiche _et_ dans la donnée brute.**
  Une date se lit « 4 janv. 2027 » et se range `2027-01-04` ; les deux sont des recherches
  légitimes, et personne ne devrait avoir à deviner laquelle le tableau connaît. Les
  accents sont ignorés — personne ne tape « Fidjrossè » dans un champ de recherche, et sur
  un catalogue béninois c'est la moitié des noms —, et les termes se coupent sur **toute**
  espace : `Intl.NumberFormat` sépare les milliers par une espace fine insécable, si bien
  qu'un montant tapé au clavier et le même recopié depuis l'écran n'ont pas le même code.
- ⚠️ **Un montant affiché est le montant saisi — aucun calendrier n'abrège un tarif.**
  Décision d'exploitation du 1er novembre 2026. `abbreviate` rendait « 150k », « 1,2 M » ;
  elle a affiché **« 2k » sur une date saisie à 1 500 F** (`Math.round(1500 / 1000)` vaut
  2), dans le planning du partenaire — où la case était **la seule vue qu'il avait de son
  tarif**, d'où sa conclusion, juste, que le système avait changé son prix — et dans le
  calendrier d'une fiche, sous les yeux d'un acheteur, sur la page où il décide de
  réserver. Elle avait déjà été rapiécée deux fois (« jamais vers zéro » après un « 0k »
  pour 10 F, puis un écart borné à 5 %) : une fonction dont le travail est de rendre un
  montant qui n'est pas le montant trouve toujours une troisième façon de mentir. Elle a
  donc été **supprimée**, pas réglée — comme `PlaceholderPage`, parce qu'une fonction
  inutilisée remet le piège à portée du prochain calendrier. Les deux calendriers passent
  par `format(m, { withCurrency: false })`, et **les cases se sont élargies pour le
  chiffre** : un tarif qui ne tient pas dans une case est un problème de case. Le
  `CustomDatePicker` abandonne sa pastille ronde de 40 px pour un rectangle pleine colonne
  **quand il porte des prix**, et seulement là — les calendriers sans tarif n'avaient
  aucune raison de changer. `tests/calendriers.test.ts` interdit le retour de
  l'abréviation, sous ce nom ou sous un autre.
- ⚠️ **Une pastille d'état se règle avec `whitespace-nowrap`, `inline-flex items-center`
  et `leading-none`.** « En attente de paiement » se coupait en deux dans une pastille
  arrondie — où un texte sur deux lignes paraît de travers —, et l'interligne par défaut
  d'un `inline-block` le laissait flotter vers le bas du cadre. Rien ne lève, rien ne se
  voit ailleurs qu'à l'œil.
- ⚠️ **Un tableau ne porte que la lecture ; les gestes vivent sur la fiche.** Chaque ligne
  de `/pro/reservations` dépliait son bloc d'annulation et sa boîte de litige — trois
  blocs empilés par réservation. D'où `/pro/reservations/[id]`, sur le moule de
  `/pro/devis/[id]` : la navigation du dépôt est **liste → fiche** partout. ⚠️ Une fiche
  cachée derrière un identifiant disparaît des contrôles si on l'y écrit en dur, l'UUID
  changeant à chaque `demo:reset` ; `smoke:ecrans` la demande donc à la base et **échoue**
  s'il n'en trouve aucune, plutôt que de sauter l'écran en silence.
- ⚠️ **La racine d'un espace est une adresse qu'on _tape_, pas seulement qu'on clique.**
  `/pro` a rendu un 404 en production — l'écran intégré de Next, en anglais, sans la
  moindre marque — signalé depuis un téléphone le 24 octobre 2026. Le défaut était
  **invisible déconnecté** : le proxy renvoyait un visiteur vers `/pro/connexion`, si bien
  que le trou ne s'ouvrait **qu'une fois la session ouverte**, c'est-à-dire pour les seuls
  partenaires réels. Et aucun lien du dépôt ne pointait vers `/pro`, donc le contrôle des
  liens morts ne pouvait rien voir : il part des **liens**, pas des adresses. Les trois
  autres espaces rendent leur tableau de bord à leur racine ; le partenaire, dont le sien
  vit à `/pro/dashboard`, redirige. `tests/navigation.test.ts` exige une page pour chaque
  racine, et `smoke:ecrans` rend `/pro` avec une session.
- ⚠️ **Le site a sa propre page introuvable** (`src/app/not-found.tsx`). Il n'en avait
  aucune, et Next rendait donc la sienne pour **toute** adresse inconnue, y compris une
  faute de frappe dans une adresse dictée. C'est la même faute que l'écran « This page
  couldn't load » de la coupure par inactivité : on n'y lit pas « cette adresse n'existe
  pas » mais « ce site est cassé ». Elle dit quoi faire ensuite, comme un état vide, et ne
  porte **aucun lien vers un espace privé** (§4) — elle s'affiche aussi sans session.
- ⚠️ Un `href` n'est qu'une chaîne : **rien ne le confronte à l'arborescence de
  `src/app`**. Le bouton « Devenir partenaire » a renvoyé un 404 en production sans
  qu'aucun outil ne bronche, et six des huit onglets de `/compte` faisaient de même.
  `tests/navigation.test.ts` garde l'en-tête et le pied de page ;
  `tests/roadmap.test.ts` garde les **quatre** menus d'espace. Un menu qui vit ailleurs
  que dans `nav-config.ts` échappe aux deux — c'était le cas d'`AccountNav`.
- Le site public connaît la session : `headerAccount()` alimente l'en-tête et le pied de
  page, qui affichent l'espace du visiteur au lieu de « Connexion ». C'est **l'unique**
  passage du public vers un espace ; l'inverse reste interdit (§4).
- ⚠️ `backdrop-blur` et `drop-shadow` **créent un contexte d'empilement** : un menu
  déroulant enfermé dedans ne peut plus passer au-dessus du reste, quel que soit son
  `z-index`. Voir `tests/stacking.test.ts`.

### 7. Données
- Aucune donnée mockée dans les back-offices ni dans les pages de production — tout vient
  de Supabase. La v1 avait un `src/lib/mock/` ; il n'a pas été repris, ne pas le réintroduire.
- **Les numéros sont stockés en E.164** (`+22901XXXXXXXX`), forme imposée par une
  contrainte `CHECK` depuis la migration 0017 et produite par `normaliseBeninPhone`. La
  contrainte est volontairement **agnostique du pays** — le schéma reste multi-pays. Le
  seed écrivait autrefois la forme lisible « +229 01 97 00 00 01 » : six organisations
  sur sept étaient injoignables par SMS sans que rien ne le signale.

### 8. Notifications
Un partenaire ne consulte pas `/pro/demandes` de lui-même : **toute action d'un client
qui appelle une réponse doit déclencher une notification.**

- **La mise en file se fait en base, jamais dans une Server Action.** Savoir quels
  partenaires sont concernés demande de lire les annonces de tous, ce que le client qui
  dépose un brief n'a pas le droit de faire. Des déclencheurs `SECURITY DEFINER`
  remplissent `notifications` au passage à l'état utile (`quote_requests` → `open`,
  `quotes` → `sent`) — donc quel que soit le chemin, publication directe ou validation
  d'entreprise.
- **L'envoi n'a lieu que dans `/api/cron/notifications`**, seul endroit où
  `SUPABASE_SECRET_KEY` est admise (§3). La base **sonne** cette route par `pg_net` dès
  qu'une ligne est écrite : la notification part en quelques secondes. Le passage
  GitHub Actions toutes les 15 min n'est qu'un filet pour les échecs.
- **La file est secrète** : elle dit qui a été prévenu, donc qui sont les concurrents en
  lice. Lecture réservée à l'administration ; `claim_notifications` et
  `mark_notification` sont retirées à `authenticated`.
- ⚠️ **Le SMS est débranché — tout part par courriel** (migration 0035). Décision
  d'exploitation : trop cher pour un résumé de 160 caractères, quand l'e-mail porte
  ville, date, convives, budget et échéance, de quoi décider **sans se connecter**.
  Le constat de terrain l'a confirmée : Premux répondait `QUOTA_EXCEEDED` sur *tous*
  les envois depuis des semaines sans que rien ne l'affiche.
  Conséquence à ne pas manquer : `app.request_recipients` exige désormais une
  **adresse** et non plus « un numéro *ou* une adresse » — sans quoi un partenaire sans
  adresse consommerait une place du plafond pour un envoi qui n'aurait pas lieu.
  `premux.ts`, `renderSms` et le canal `sms` de l'énumération sont **conservés** :
  débrancher n'est pas détruire, et les lignes déjà envoyées y font référence. Le
  drainage refuse explicitement ce canal plutôt que de l'ignorer — une notification qui
  disparaît sans trace est pire qu'une notification en erreur.
- **Plafond de 20 destinataires par demande.** Il bornait l'envoi *payant* ; depuis le
  passage au courriel, il borne la **pertinence** — au-delà, on sollicite des
  prestataires que la demande ne concerne qu'à la marge — et protège la réputation
  d'expéditeur. Il est désormais remontable sans risque financier. Au-delà, la demande
  reste visible dans `/pro/demandes`.
- **Tout ce qui vient de la base est échappé dans un e-mail.** Un nom d'enseigne est une
  chaîne saisie par un partenaire ; concaténée telle quelle dans du HTML, c'est une
  injection — dans la boîte de réception d'un client. Styles en ligne et mise en page en
  tableaux (Outlook ignore les feuilles de style), et **une variante texte obligatoire**,
  faute de quoi le message est noté comme indésirable.
- **Deux familles d'e-mails, une seule mise en page.** Les notifications partent de
  notre code (`./emails.ts` → Resend) ; les e-mails d'authentification — confirmation
  d'adresse, mot de passe oublié, lien de connexion — partent de **Supabase Auth**, qui
  garde ses propres gabarits. Les deux passent par `src/lib/notify/shell.ts`, sans quoi
  l'identité visuelle divergerait à la première retouche. Les gabarits Supabase vivent
  dans `src/lib/notify/auth-emails.ts` : le dépôt reste la source de vérité,
  `npm run mails:auth` republie, et `tests/auth-emails.test.ts` vérifie les marqueurs —
  un marqueur mal orthographié ne lève aucune erreur, il envoie un bouton qui ne mène
  nulle part.
- ⚠️ **`{{ .ConfirmationURL }}` est proscrit, et le test l'interdit explicitement.** Ce
  marqueur a produit pendant des semaines des liens qui ne pouvaient structurellement
  pas aboutir — « Ce lien n'est plus valable » sur un courriel reçu à l'instant. Deux
  causes, aucune corrigeable par un réglage : la session revient soit dans un
  **fragment** (`#access_token=…`), que le navigateur ne transmet **jamais** au serveur,
  soit dans un **code PKCE**, dont le vérificateur est un cookie posé sur le navigateur
  d'origine — or on ouvre ses courriels où ils arrivent, et l'application Gmail ouvre le
  sien. Tous les liens passent donc par `{{ .TokenHash }}` et la route `/auth/confirm`,
  qui appelle `verifyOtp({ token_hash, type })` : tout arrive en paramètre de requête,
  aucun cookie préalable n'est exigé, le lien marche depuis n'importe quel appareil.
  C'est le chemin que Supabase documente pour le rendu côté serveur.
- Resend est isolé dans `src/lib/mail/resend.ts` — seul fichier du dépôt à le connaître.
  Trois pièges y sont documentés : l'expéditeur exige un **domaine vérifié** (sinon 403,
  au libellé trompeur), le champ de réponse s'appelle **`reply_to`** et non `replyTo`
  (la forme chameau est ignorée sans erreur), et la limite est de **2 requêtes par
  seconde** — le module s'auto-cadence, le drainage traitant 25 lignes d'affilée.
- ⚠️ **Le DNS d'`enievent.com` ne tolère qu'un seul SPF.** Resend pose ses
  enregistrements sous `send.enievent.com` et `resend._domainkey`, donc sans toucher aux
  4 `MX` ni au `SPF` d'OVH. Ajouter un second `v=spf1` sur l'apex invaliderait les deux
  et ferait partir **tout** le courrier du domaine en indésirable. Voir
  `docs/DEPLOIEMENT.md` §3 bis.
- **Un SMS français ne fait pas 160 caractères.** L'alphabet GSM 03.38 contient `é`, `è`,
  `à`, `Ç` — mais **ni `ç` minuscule, ni l'apostrophe typographique `’`, ni `« »`, ni
  `…`**. Un seul de ces caractères fait tomber la capacité à 70 et triple la facture.
  Les textes vivent dans `src/lib/notify/messages.ts`, passent par `toGsmSafe`, et sont
  testés **au pire cas** (nom d'enseigne long, identifiant de 36 caractères).
- ⚠️ **Le corps d'un message ne circule jamais par courriel** (`message.new`). Le
  masquage des coordonnées vit dans `read_conversation` ; un extrait dans la charge utile
  le contournerait entièrement — il suffirait d'écrire son numéro pour qu'il parte en
  clair dans une boîte de réception. C'est la seule charge utile du dépôt qui ne
  transporte volontairement aucun texte libre.
- ⚠️ **Un règlement encaissé prévient les deux parties** (migration 0053). Au premier
  paiement réel abouti — 21 octobre 2026 —, **personne n'a été prévenu** : ni le client,
  ni le partenaire. Ce n'était pas une panne d'envoi, la file était verte et les courriels
  du tunnel de devis partaient ; c'était un **événement absent**. `payments` n'avait aucun
  déclencheur et `KINDS` aucun type de paiement : tout notifiait sauf le moment où l'argent
  arrive, c'est-à-dire le seul que les deux parties attendent. Et `/paiement/retour`
  promettait déjà l'inverse au client, mot pour mot — « Votre prestataire en est informé.
  Vous recevrez un récapitulatif par e-mail. » —, donc au pire endroit : juste après qu'il
  a sorti de l'argent. ⚠️ **Le `ref_id` est l'identifiant du _paiement_, jamais celui de
  la commande** : avec la commande, l'unicité `(kind, ref_id, recipient)` aurait avalé en
  silence l'annonce de tout solde d'échéancier — pas d'erreur, pas de trace, un courriel
  manquant que personne n'aurait cherché. Deux rédactions pour deux questions : le client
  veut sa preuve et ce qui lui reste à sortir, le partenaire veut savoir que sa date est
  tenue, ce qui lui revient, et **quand il sera payé** — cette dernière remplirait le
  support si on la laissait sans réponse.
- **Une notification par salve, pas par message.** `send_message` n'alimente la file que
  si le message précédent venait de l'autre partie : dix allers-retours font un seul
  courriel, et la réponse d'en face rouvre le droit d'alerter. Règle sans état, donc sans
  dérive. Ne pas la remplacer par un compteur de non-lus, plus fragile.
- ⚠️ **Le texte d'un avis ne voyage pas non plus, et pour une autre raison.** Un avis est
  public : ce n'est pas le secret qui l'en empêche, c'est qu'un partenaire qui lit « 2/5 »
  et deux lignes d'extrait répond de mémoire, souvent mal — et il n'a droit qu'à **une**
  réponse. `review.received` porte donc la note, l'annonce et un bouton, rien de plus. Un
  signalement, lui, **transporte son motif** : son destinataire est l'équipe, qui a par
  ailleurs accès à la table, et le cacher obligerait à ouvrir le back-office pour savoir
  s'il faut s'y mettre tout de suite — même raisonnement que `support.new`.
  ⚠️ **Et aucun de ces deux courriels ne promet de retrait.** `review.received` est lu par
  un partenaire qui découvre un 1/5, donc au moment précis où il cherche comment le faire
  enlever : il dit donc tout de suite qu'un avis ne se retire pas, et pourquoi sa réponse
  vaut mieux pour lui. Un texte qui laisse espérer un retrait fabrique une déception et
  une réclamation.
- ⚠️ **`dispute.opened` a trois destinataires et trois rédactions, et jamais celui qui
  l'ouvre.** La charge utile porte `pour` (`client`, `partner` ou `equipe`) et tout le
  texte en dépend : la partie mise en cause doit pouvoir donner sa version, et apprendre
  par surprise qu'une décision a été prise sans elle serait le pire parcours possible.
  Celui qui ouvre le litige, lui, le sait déjà.
- Premux est isolé dans `src/lib/sms/premux.ts` — seul fichier du dépôt à le connaître.
  `X-Premux-Domain` attend **le domaine de la clé** (`enievent.com`), pas `premux.bj`
  comme le montre leur documentation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
