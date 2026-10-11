import { createClient } from "@supabase/supabase-js";

/**
 * La déconnexion par inactivité, telle que le navigateur la vit.
 *
 *   npm run smoke:inactivite
 *   SMOKE_BASE_URL=https://enievent.com npm run smoke:inactivite
 *
 * ⚠️ **Ce contrôle existe parce qu'un défaut a atteint la production sans que
 * rien ne le voie.** La coupure passait par une Server Action ; le proxy
 * répondait un 307, le navigateur rejouait le POST sur la page de connexion, et
 * Next affichait « This page couldn't load ». L'utilisateur y lisait une panne
 * d'ÉniEvent au lieu d'une déconnexion.
 *
 * Rien dans `npm run verify` ne pouvait l'attraper : le code compile, les types
 * sont bons, et l'enchaînement ne se joue qu'entre un navigateur, un proxy et
 * trois sortes de requêtes. On le rejoue donc ici, en forgeant un horodatage
 * d'activité **expiré mais correctement signé** — l'état exact d'un onglet
 * laissé ouvert.
 *
 * Ce qui est vérifié, pour chaque espace protégé :
 *
 *   1. une navigation expirée arrive sur **sa** page de connexion, qui
 *      **explique** la déconnexion ;
 *   2. la déconnexion volontaire aboutit **même quand le délai est déjà
 *      dépassé** — c'est le cas nominal, et c'est celui qui échouait ;
 *   3. elle aboutit aussi quand la session est encore vivante ;
 *   4. elle efface réellement les cookies, dans les deux cas ;
 *   5. `/api/session` distingue une session vivante d'une session tombée, ce
 *      dont dépend le message de la frontière d'erreur.
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = process.env.SUPABASE_PROJECT_REF;
const secret = process.env.SESSION_SECRET;
const password = process.env.DEMO_PASSWORD;

if (!url || !key || !ref || !secret || !password) {
  console.error("Variables manquantes (dont SESSION_SECRET). Lancez avec --env-file=.env.local");
  process.exit(1);
}

let echecs = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "  OK  " : " ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const encoder = new TextEncoder();

/** Même calcul que `src/lib/auth/inactivity.ts` : `<horodatage>.<signature>`. */
async function stamp(at) {
  const seconds = Math.floor(at / 1000);
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(String(seconds)));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${seconds}.${hex}`;
}

/** Le cookie attendu par `@supabase/ssr` : `base64-` + base64url du JSON. */
function sessionCookies(session) {
  const b64 = Buffer.from(JSON.stringify(session), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const valeur = `base64-${b64}`;
  const nom = `sb-${ref}-auth-token`;

  if (valeur.length <= 3180) return [`${nom}=${valeur}`];

  const morceaux = [];
  for (let i = 0; i * 3180 < valeur.length; i += 1) {
    morceaux.push(`${nom}.${i}=${valeur.slice(i * 3180, (i + 1) * 3180)}`);
  }
  return morceaux;
}

async function session(email) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`connexion ${email} : ${error.message} — lancez npm run demo:reset`);
  return sessionCookies(data.session);
}

/** Les cookies effacés par une réponse, d'après ses `Set-Cookie`. */
function effaces(reponse) {
  const brut = reponse.headers.getSetCookie?.() ?? [];
  return brut
    .filter((c) => /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c))
    .map((c) => c.split("=")[0]);
}

const ESPACES = [
  { titre: "Partenaire", email: "demo-partenaire@enievent.bj", page: "/pro/dashboard", signIn: "/pro/connexion" },
  { titre: "Administration", email: "demo-admin@enievent.bj", page: "/admin", signIn: "/admin/connexion" },
  { titre: "Particulier", email: "demo-particulier@enievent.bj", page: "/compte", signIn: "/connexion" },
  { titre: "Entreprise", email: "demo-entreprise@enievent.bj", page: "/entreprise", signIn: "/connexion" },
];

try {
  // Vingt minutes : au-delà du délai, quel que soit l'espace.
  const expire = await stamp(Date.now() - 20 * 60 * 1000);
  const frais = await stamp(Date.now());

  for (const espace of ESPACES) {
    console.log(`\n${espace.titre}`);

    const base = await session(espace.email);
    const perime = [...base, `ee-activity=${expire}`].join("; ");
    const vivant = [...base, `ee-activity=${frais}`].join("; ");

    // --- 1. La navigation expirée arrive sur la bonne page, qui explique ----
    const deroute = await fetch(`${BASE}${espace.page}`, {
      headers: { Cookie: perime },
      redirect: "manual",
    });
    const vers = deroute.headers.get("location") ?? "";

    check(
      "une navigation expirée part vers la connexion de son espace",
      deroute.status === 307 && vers.startsWith(`${espace.signIn}?raison=inactivite`),
      `${deroute.status} → ${vers || "nulle part"}`,
    );

    const arrivee = await fetch(`${BASE}${vers}`, { redirect: "manual" });
    const page = await arrivee.text();

    check(
      "la page d'arrivée explique la déconnexion",
      arrivee.status === 200 && /session a expiré/i.test(page),
      arrivee.status === 200 ? "« session a expiré »" : `statut ${arrivee.status}`,
    );

    // ⚠️ L'écran ne doit **pas** annoncer de durée : le chiffre se règle en
    // base et la phrase finirait par en dire une autre.
    check(
      "sans annoncer au bout de combien de temps",
      !/\b(15|quinze|30|trente|60|soixante)\s*(minutes?|min)\b/i.test(page),
      "aucune durée affichée",
    );

    // --- 2. `/api/session` distingue une session vivante d'une session tombée
    //
    // ⚠️ **Avant les déconnexions, et pas après.** Se déconnecter révoque le
    // jeton de rafraîchissement chez Supabase : le même cookie rejoué ensuite
    // ne vaut plus rien, et l'API répondrait 401 pour la mauvaise raison. La
    // première version de ce script tombait exactement dans ce piège.
    const encoreLa = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { Cookie: vivant },
    });
    const partie = await fetch(`${BASE}/api/session`, { method: "POST" });

    check(
      "l'API distingue une session vivante d'une session tombée",
      encoreLa.status === 204 && partie.status === 401,
      `vivante ${encoreLa.status}, tombée ${partie.status}`,
    );

    // --- 3. La déconnexion volontaire, délai déjà dépassé -------------------
    //
    // ⚠️ **Le cas qui échouait, et qui est le cas nominal.** Le proxy ne repose
    // l'horodatage qu'une fois par minute : quand l'écran décide de couper, le
    // serveur a presque toujours déjà tranché.
    const suivant = encodeURIComponent(`${espace.signIn}?raison=inactivite`);
    const sortie = await fetch(`${BASE}/auth/deconnexion?suivant=${suivant}`, {
      headers: { Cookie: perime },
      redirect: "manual",
    });

    check(
      "la déconnexion aboutit malgré le délai dépassé",
      sortie.status === 307 &&
        (sortie.headers.get("location") ?? "").endsWith(`${espace.signIn}?raison=inactivite`),
      `${sortie.status} → ${sortie.headers.get("location") ?? "nulle part"}`,
    );

    check(
      "et elle efface la session",
      effaces(sortie).some((n) => n.startsWith("sb-")) && effaces(sortie).includes("ee-activity"),
      effaces(sortie).join(", ") || "RIEN D'EFFACÉ",
    );

    // --- 4. La même, session encore vivante --------------------------------
    const sortieVivante = await fetch(`${BASE}/auth/deconnexion?suivant=${suivant}`, {
      headers: { Cookie: vivant },
      redirect: "manual",
    });

    // ⚠️ **C'est ici que se joue le report des `Set-Cookie`.** Dans le cas
    // expiré, le proxy a déjà effacé les cookies de son côté : le contrôle
    // précédent passerait même sans la boucle de la route. Sur une session
    // **vivante**, le proxy ne touche à rien — seule la route efface, et
    // `ee-activity` est la preuve qu'elle le fait. Éprouvé en retirant la
    // boucle : sans elle, cette ligne tombe, et elle seule.
    const nettoyes = effaces(sortieVivante);

    check(
      "elle aboutit aussi sur une session vivante, et nettoie tout",
      sortieVivante.status === 307 &&
        nettoyes.some((n) => n.startsWith("sb-")) &&
        nettoyes.includes("ee-activity"),
      `${sortieVivante.status}, efface ${nettoyes.join(", ") || "rien"}`,
    );

  }

  // --- 5. La destination ne se détourne pas --------------------------------
  //
  // ⚠️ `safeInternalPath` analyse l'adresse plutôt que d'en lire les premiers
  // caractères : `/\evil.com` franchissait l'ancien contrôle, parce que le
  // parseur traite l'anti-slash comme une barre.
  console.log("\nDestination");

  for (const forge of ["https://evil.example/x", "//evil.example/x", "/\\evil.example"]) {
    const r = await fetch(`${BASE}/auth/deconnexion?suivant=${encodeURIComponent(forge)}`, {
      redirect: "manual",
    });
    const vers = r.headers.get("location") ?? "";
    const interne = vers.startsWith(BASE) || vers.startsWith("/");
    const chezNous = !/evil\.example/.test(vers);

    check(`« ${forge} » ne sort pas du site`, interne && chezNous, vers || "nulle part");
  }
} catch (error) {
  console.error(`\nInterrompu : ${error.message}`);
  echecs += 1;
}

console.log("");
if (echecs > 0) {
  console.error(`${echecs} échec(s).`);
  process.exit(1);
}
console.log("La déconnexion par inactivité se passe comme prévu.");
