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
      "/pro/demandes",
      "/pro/devis",
      "/pro/statistiques",
      "/pro/parametres",
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
      "/admin/demandes",
      "/admin/demandes?etat=open",
      "/admin/demandes?etat=awarded",
      "/admin/partenaires",
      "/admin/utilisateurs",
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

if (echecs > 0) {
  console.error(`${echecs} écran(s) en échec.`);
  process.exit(1);
}

console.log("Tous les écrans s'affichent.");
