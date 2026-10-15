import { createClient } from "@supabase/supabase-js";

/**
 * Rend réellement chaque écran, connecté, et vérifie qu'il s'affiche.
 *
 * **Ce contrôle existe parce que `npm run verify` ne peut pas le faire.** Le
 * typecheck, le lint et les tests ne rendent aucune page : une requête
 * PostgREST mal formée — une relation ambiguë, une clé étrangère absente —
 * compile parfaitement et ne se manifeste qu'à l'exécution, en 500. C'est
 * arrivé à `/admin/demandes`, livrée verte et cassée.
 *
 * Deux pièges que ce script évite :
 *
 * 1. **Un 200 ne suffit pas.** Next sert sa page d'erreur avec un corps HTML ;
 *    on cherche donc `__next_error__`, sa signature.
 * 2. **Une page peut être vide sans être en erreur.** On exige aussi un `<h1>`,
 *    faute de quoi une page blanche passerait pour un succès.
 *
 *   npm run smoke:ecrans                      # contre la production
 *   SMOKE_BASE_URL=http://localhost:3210 …    # contre le serveur local
 */

const BASE = process.env.SMOKE_BASE_URL ?? "https://enievent.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.DEMO_PASSWORD;

if (!url || !key || !ref || !password) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

/** Écrans à rendre, par compte. Les routes dynamiques prennent un vrai slug. */
const PARCOURS = [
  {
    compte: null,
    titre: "Visiteur",
    routes: [
      "/",
      "/recherche",
      "/lieux",
      "/prestataires",
      "/categories",
      "/categories/traiteur",
      "/lieux/salle-etoile-haie-vive",
      "/connexion",
      "/inscription",
      "/pro/connexion",
      "/pro/inscription",
      "/demande-de-devis",
      "/mot-de-passe-oublie",
      "/pro/mot-de-passe-oublie",
      "/admin/connexion",
      "/admin/mot-de-passe-oublie",
      "/nouveau-mot-de-passe",
      "/contact",
      "/mentions-legales",
      "/conditions-generales",
      "/confidentialite",
      "/compte-supprime",
    ],
  },
  {
    compte: "demo-particulier@enievent.bj",
    titre: "Particulier",
    routes: [
      "/compte",
      "/compte/reservations",
      "/compte/messages",
      "/compte/favoris",
      "/compte/paiements",
      "/compte/documents",
      "/compte/profil",
      "/projets",
    ],
  },
  {
    compte: "demo-partenaire@enievent.bj",
    titre: "Partenaire",
    routes: [
      "/pro/dashboard",
      "/pro/annonces",
      "/pro/annonces/nouvelle",
      "/pro/planning",
      "/pro/messages",
      "/pro/demandes",
      "/pro/devis",
      "/pro/reservations",
      "/pro/avis",
      "/pro/finances/revenus",
      "/pro/finances/versements",
      "/pro/statistiques",
      "/pro/parametres",
      "/pro/equipe",
      "/pro/support",
      "/pro/documents",
    ],
  },
  {
    compte: "demo-entreprise@enievent.bj",
    titre: "Entreprise",
    routes: [
      "/entreprise",
      "/entreprise/budgets",
      "/entreprise/validations",
      "/entreprise/devis",
      "/entreprise/projets",
      "/entreprise/equipe",
      "/entreprise/messages",
      "/entreprise/fournisseurs",
      "/entreprise/parametres",
    ],
  },
  {
    compte: "demo-admin@enievent.bj",
    titre: "Administration",
    routes: [
      "/admin",
      "/admin/moderation",
      "/admin/avis",
      "/admin/demandes",
      "/admin/demandes?etat=open",
      "/admin/demandes?etat=awarded",
      "/admin/partenaires",
      "/admin/entreprises",
      "/admin/utilisateurs",
      // La recherche est un chemin distinct : elle appelle `admin_users` avec
      // un argument, et c'est là qu'une signature de fonction mal accordée se
      // manifeste — jamais à la compilation.
      "/admin/utilisateurs?q=demo",
      "/admin/categories",
      "/admin/villes",
      "/admin/journal",
      "/admin/rapports",
      "/admin/rapports?jours=7",
      "/admin/feature-flags",
      "/admin/paiements",
      "/admin/versements",
      "/admin/remboursements",
      "/admin/litiges",
      "/admin/signalements",
      "/admin/parametres",
    ],
  },
];

async function cookieFor(email) {
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password });

  if (error) throw new Error(`${email} : ${error.message}`);

  const s = data.session;
  const jeton = Buffer.from(
    JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at,
      expires_in: s.expires_in,
      token_type: "bearer",
      user: s.user,
    }),
  ).toString("base64");

  return `sb-${ref}-auth-token=base64-${jeton}`;
}

let echecs = 0;

console.log(`Écrans rendus contre ${BASE}\n`);

for (const parcours of PARCOURS) {
  console.log(parcours.titre);
  const cookie = parcours.compte ? await cookieFor(parcours.compte) : null;

  for (const route of parcours.routes) {
    let verdict;

    try {
      const r = await fetch(BASE + route, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });

      if (r.status >= 300 && r.status < 400) {
        // Une redirection est légitime (page non construite, accès refusé) tant
        // qu'elle est voulue : on la signale sans la compter en échec.
        verdict = `→ ${r.status} vers ${r.headers.get("location")}`;
      } else if (r.status !== 200) {
        verdict = `ÉCHEC ${r.status}`;
        echecs += 1;
      } else {
        const html = await r.text();

        if (html.includes("__next_error__")) {
          verdict = "ÉCHEC — page d'erreur Next";
          echecs += 1;
        } else if (!/<h1[^>]*>/.test(html)) {
          verdict = "ÉCHEC — aucun titre, page vide ?";
          echecs += 1;
        } else {
          const titre = (html.match(/<h1[^>]*>([^<]{0,48})/) ?? [])[1] ?? "";
          verdict = `ok — « ${titre.trim()} »`;
        }
      }
    } catch (e) {
      verdict = `ÉCHEC réseau — ${String(e.message).slice(0, 60)}`;
      echecs += 1;
    }

    const marque = verdict.startsWith("ÉCHEC") ? "  ✗" : "  ✓";
    console.log(`${marque} ${route.padEnd(34)} ${verdict}`);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// La marque, déclarée et servie
//
// ⚠️ **Un favicon cassé répond 200.** Next lit `favicon.ico` pour écrire ses
// balises `<link rel="icon">` ; avec des PNG indexés en palette au lieu de RGBA,
// son décodeur refuse — « The PNG is not in RGBA format! » — et **aucune balise
// n'est émise**, pendant que le fichier continue d'être servi normalement. Un
// contrôle qui s'arrête au code de retour conclut que tout va bien.
//
// Et les chemins de `public/` comptent autant : iOS et les moissonneurs
// d'icônes qui alimentent les suggestions de recherche **ne lisent pas le
// HTML**, ils tapent ces adresses à la racine. Les deux rendaient un 404 en
// HTML jusqu'au 15 octobre 2026, d'où un iPhone qui affichait une autre marque
// dans ses suggestions que sur le site ouvert.
// ---------------------------------------------------------------------------
console.log("La marque");

const accueil = await fetch(BASE).then((r) => r.text());

for (const [quoi, motif] of [
  ["balise icon", /<link rel="icon"[^>]*favicon\.ico/],
  ["balise icon 512", /<link rel="icon"[^>]*icon\.png/],
  ["balise apple-touch-icon", /<link rel="apple-touch-icon"/],
  ["balise manifest", /<link rel="manifest"/],
]) {
  const ok = motif.test(accueil);
  if (!ok) echecs += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi.padEnd(34)} ${ok ? "déclarée" : "ABSENTE du HTML"}`);
}

for (const chemin of [
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icon-192.png",
  "/manifest.webmanifest",
]) {
  const r = await fetch(`${BASE}${chemin}`);
  const type = r.headers.get("content-type") ?? "";
  // Un 404 de Next rend du HTML : exiger le type évite de compter une page
  // d'erreur pour une icône.
  const ok = r.status === 200 && /image|manifest/.test(type);

  if (!ok) echecs += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${chemin.padEnd(34)} ${r.status} ${type.split(";")[0]}`);
}

console.log("");

// ---------------------------------------------------------------------------
// Ce que lisent les robots
//
// L'icône affichée par un moteur dans ses suggestions vient de **son** index,
// qui ne bouge qu'à la ré-exploration : guider les robots est le seul levier
// que nous ayons dessus. Les deux fichiers rendaient un 404 jusqu'au
// 15 octobre 2026, alors que le proxy les excluait déjà nommément.
//
// ⚠️ **Une adresse du plan de site qui redirige est comptée comme un défaut
// par les moteurs.** Les fiches se rendent par le même composant mais ont
// chacune une seule URL canonique — `/lieux/…` pour un lieu, `/prestataires/…`
// pour un service — et l'autre renvoie un 307. On échantillonne donc le plan
// plutôt que de faire confiance au calcul.
// ---------------------------------------------------------------------------
console.log("Les robots");

const robots = await fetch(`${BASE}/robots.txt`);
const robotsTexte = await robots.text();
const robotsOk =
  robots.status === 200 &&
  /Sitemap:/i.test(robotsTexte) &&
  ["/admin", "/pro", "/compte", "/entreprise", "/projets"].every((e) =>
    robotsTexte.includes(`Disallow: ${e}`),
  );

if (!robotsOk) echecs += 1;
console.log(
  `  ${robotsOk ? "✓" : "✗"} ${"/robots.txt".padEnd(34)} ${robots.status} ${
    robotsOk ? "espaces privés écartés, plan annoncé" : "INCOMPLET"
  }`,
);

const plan = await fetch(`${BASE}/sitemap.xml`);
const planTexte = await plan.text();
const adresses = [...planTexte.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const planOk = plan.status === 200 && adresses.length > 0;

if (!planOk) echecs += 1;
console.log(
  `  ${planOk ? "✓" : "✗"} ${"/sitemap.xml".padEnd(34)} ${plan.status} ${adresses.length} adresse(s)`,
);

// Un échantillon de fiches : c'est là que le préfixe peut être faux.
const fiches = adresses.filter((u) => /\/(lieux|prestataires)\//.test(u)).slice(0, 8);
let devient = 0;

for (const adresse of fiches) {
  const r = await fetch(adresse, { redirect: "manual" });
  if (r.status !== 200) {
    devient += 1;
    console.log(`  ✗ ${adresse.slice(BASE.length).padEnd(34)} ${r.status} au lieu de 200`);
  }
}

if (devient > 0) echecs += devient;
else console.log(`  ✓ ${`${fiches.length} fiches échantillonnées`.padEnd(34)} toutes en 200`);

console.log("");

if (echecs > 0) {
  console.error(`${echecs} écran(s) en échec.`);
  process.exit(1);
}

console.log("Tous les écrans s'affichent.");
