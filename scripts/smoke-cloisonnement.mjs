import { createClient } from "@supabase/supabase-js";

/**
 * Le back-office est-il réellement fermé ?
 *
 * Deux couches, et la seconde seule protège vraiment :
 *
 * 1. **L'écran.** Le layout `/admin` rend un refus au lieu des enfants. Utile,
 *    mais cosmétique : dans l'App Router, page et layout se rendent en
 *    parallèle, et rien n'empêche quelqu'un d'interroger l'API directement.
 * 2. **La base.** La RLS décide ce que chaque compte peut lire, quel que soit
 *    le chemin emprunté. C'est la seule barrière qui tienne devant un
 *    utilisateur qui n'ouvre pas de navigateur.
 *
 * Ce script éprouve les deux, avec les quatre comptes de démonstration, et
 * compare ce que voit un non-administrateur à ce que voit l'administration.
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

const COMPTES = [
  { titre: "Particulier", email: "demo-particulier@enievent.bj" },
  { titre: "Partenaire", email: "demo-partenaire@enievent.bj" },
  { titre: "Entreprise", email: "demo-entreprise@enievent.bj" },
];

const ROUTES_ADMIN = [
  "/admin",
  "/admin/moderation",
  "/admin/demandes",
  "/admin/partenaires",
  "/admin/utilisateurs",
  "/admin/journal",
  "/admin/parametres",
];

/** Signes qu'une page d'administration a bel et bien été rendue. */
const MARQUEURS_ADMIN = [
  "Annonces à valider",
  "Renvoyer au partenaire",
  "Valider et publier",
  "Vue d&#x27;ensemble",
  "À valider",
];

let echecs = 0;
const rate = (message) => {
  console.log(`  ✗ ${message}`);
  echecs += 1;
};

async function session(email) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
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

  return { client, cookie: `sb-${ref}-auth-token=base64-${jeton}`, userId: s.user.id };
}

// ---------------------------------------------------------------------------
console.log(`Cloisonnement du back-office — ${BASE}\n`);
console.log("1. Les écrans d'administration");

const admin = await session("demo-admin@enievent.bj");

for (const compte of COMPTES) {
  const { cookie } = await session(compte.email);
  const refus = [];

  for (const route of ROUTES_ADMIN) {
    const r = await fetch(BASE + route, { headers: { cookie }, redirect: "manual" });
    const html = r.status === 200 ? await r.text() : "";

    const fuite = MARQUEURS_ADMIN.filter((m) => html.includes(m));
    if (fuite.length > 0) rate(`${compte.titre} voit du contenu admin sur ${route} : ${fuite.join(", ")}`);
    else if (r.status === 200 && !html.includes("réservé à l&#x27;équipe")) {
      rate(`${compte.titre} : ${route} rend 200 sans écran de refus`);
    } else refus.push(route);
  }

  console.log(`  ✓ ${compte.titre.padEnd(12)} refusé sur ${refus.length}/${ROUTES_ADMIN.length} écrans`);
}

// Un visiteur non connecté ne doit pas même atteindre le refus.
const anon = await fetch(`${BASE}/admin`, { redirect: "manual" });
if (anon.status !== 307 && anon.status !== 302) rate(`Visiteur anonyme : /admin rend ${anon.status} au lieu d'une redirection`);
else console.log(`  ✓ Visiteur     redirigé vers ${anon.headers.get("location")}`);

// ---------------------------------------------------------------------------
console.log("\n2. Les données, interrogées directement (sans navigateur)");

/** Ce que l'administration voit, et que les autres ne doivent pas voir en entier. */
const SONDES = [
  { table: "quote_requests", colonne: "id", intitule: "appels d'offres" },
  { table: "notifications", colonne: "id", intitule: "file de notifications" },
  { table: "audit_logs", colonne: "id", intitule: "journal d'audit" },
  { table: "kyc_documents", colonne: "id", intitule: "dossiers KYC" },
  { table: "profiles", colonne: "id", intitule: "profils" },
];

for (const sonde of SONDES) {
  const { count: vuParAdmin } = await admin.client
    .from(sonde.table)
    .select(sonde.colonne, { count: "exact", head: true });

  const lignes = [];

  for (const compte of COMPTES) {
    const { client } = await session(compte.email);
    const { count } = await client.from(sonde.table).select(sonde.colonne, { count: "exact", head: true });
    lignes.push(`${compte.titre} ${count ?? 0}`);

    // Seule la file de notifications et le journal doivent être totalement
    // clos ; les autres tables laissent légitimement voir ce qui appartient au
    // compte. Ce qui serait grave, c'est d'en voir *autant* que l'administration.
    if ((count ?? 0) >= (vuParAdmin ?? 0) && (vuParAdmin ?? 0) > 0) {
      rate(`${compte.titre} voit ${count} ${sonde.intitule} — autant que l'administration (${vuParAdmin})`);
    }
  }

  console.log(`  ✓ ${sonde.intitule.padEnd(24)} admin ${String(vuParAdmin ?? 0).padEnd(4)} | ${lignes.join(" · ")}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. La promotion en administrateur, rejouée");

for (const compte of COMPTES) {
  const { client, userId } = await session(compte.email);
  const { error } = await client.from("profiles").update({ account_type: "admin" }).eq("id", userId);
  const { data: apres } = await admin.client
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .single();

  if (apres?.account_type === "admin") rate(`${compte.titre} s'est promu administrateur !`);
  else console.log(`  ✓ ${compte.titre.padEnd(12)} reste ${apres?.account_type} — ${error ? error.message.slice(0, 42) : "refus silencieux"}`);
}

console.log("");
if (echecs > 0) {
  console.error(`${echecs} faille(s).`);
  process.exit(1);
}
console.log("Le back-office est clos.");
