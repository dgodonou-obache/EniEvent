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

Plan d'implémentation de référence : `C:\Users\dgodo\.claude\plans\wobbly-puzzling-kay.md`.
Cette V2 remplace l'app v1 située dans `..\ÉniEvent` (lecture seule, source de reprise).

## Stack

Next.js 16 (App Router, RSC, Server Actions) · React 19 · TypeScript strict ·
Tailwind 3.4 · Supabase (Postgres, Auth, Storage, RLS) · Zod + react-hook-form ·
CinetPay (Mobile Money, carte) · Resend · Vitest.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement — **vérifier le port annoncé**, le 3000 est souvent pris |
| `npm run verify` | typecheck + lint + tests — **à passer avant tout commit** |
| `npm run db:verify` | Rejoue les migrations dans un Postgres jetable (PGlite) et exige la RLS partout |
| `npm run db:types` | Régénère `src/types/database.ts` après une migration |
| `npm run db:seed` | Applique `supabase/seed.sql` (rejouable) |
| `npm run demo:reset` | Seed + comptes de démonstration |
| `npm run smoke` | Contrôles de bout en bout contre le vrai Supabase |

Recette manuelle : `docs/RECETTE.md`.

> ⚠️ La **confirmation d'e-mail est désactivée** sur le projet de développement, pour que
> les comptes de test soient utilisables sans dépendre d'un envoi. À réactiver avant la
> production, avec un SMTP Resend et un domaine vérifié.

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

### 2. Changements d'état
Aucune transition d'état (réservation, devis, paiement, séquestre) ne se décide côté
client. Server Actions ou fonctions Postgres `SECURITY DEFINER` uniquement, journalisées
dans `audit_logs`. Les transitions autorisées vivent dans `src/lib/states.ts`.

### 3. Sécurité
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
- `SUPABASE_SECRET_KEY` : webhooks et tâches planifiées uniquement. Jamais dans un
  composant, jamais dans une Server Action déclenchée par un utilisateur.
- Les webhooks de paiement sont **idempotents** (contrainte unique sur
  `payments.idempotency_key`) et revérifient le montant côté serveur.

### 4. Isolation des espaces
Les cinq espaces sont étanches. Un partenaire déconnecté est renvoyé sur
`/pro/connexion`, jamais sur `/connexion` ; aucun lien « retour au site » dans les
back-offices. Le middleware ne contrôle que l'authentification ; l'autorisation (rôle,
appartenance à une organisation) est faite dans le layout serveur de chaque espace.

### 5. Rédaction destinée aux utilisateurs
Pas de jargon. Les politiques d'annulation et de paiement se disent en clair :
« Non remboursable », pas « Annulation stricte » ; « Annulation gratuite jusqu'à 48 h
avant », pas « Politique flexible ». Interface en français.

### 6. Interface
- Suivre `.claude/rules/design-system.md` — orange pêche en primaire, teal par touches,
  neutres slate, `rounded-2xl`, ombres douces, `active:scale-[0.98]`, `transition-all`.
- **Jamais** de `<input type="date">` natif : utiliser `CustomDatePicker`.
- ⚠️ **Aucune fonction ne traverse la frontière serveur → client** : composant
  d'icône, callback, classe. La sérialisation RSC échoue **à l'exécution
  seulement** — ni `tsc`, ni `eslint`, ni `next build` ne la voient, car ces
  pages sont dynamiques et ne sont jamais prérendues. Un menu passé en propriété
  a rendu les trois back-offices en 500 sans qu'aucun contrôle automatique ne
  le signale. Passer une clé (`space="partner"`) et résoudre côté client.
  Corollaire : **rendre réellement une page authentifiée** avant de la déclarer
  livrée ; un test contre la base ne prouve pas que l'écran s'affiche.
- Mobile-first, vérifié à 390 px : pas de débordement de modale ni de menu déroulant.
- Zones défilables : `overflow-y-auto no-scrollbar`.

### 7. Données
Aucune donnée mockée dans les back-offices ni dans les pages de production — tout vient
de Supabase. La v1 avait un `src/lib/mock/` ; il n'a pas été repris, ne pas le réintroduire.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
