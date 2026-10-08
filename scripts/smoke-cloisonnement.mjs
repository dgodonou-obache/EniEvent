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
 * Ce script éprouve les deux, avec les quatre comptes de démonstration. Chaque
 * table dit **ce qu'on attend d'elle**, et non « moins que l'administration » :
 * un partenaire voit légitimement tous les appels d'offres ouverts de sa ville
 * et de ses catégories — c'est la raison d'être du tunnel.
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
  { titre: "Particulier", email: "demo-particulier@enievent.bj"},
  { titre: "Partenaire", email: "demo-partenaire@enievent.bj"},
  { titre: "Entreprise", email: "demo-entreprise@enievent.bj"},
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

/**
 * ⚠️ **Une session par compte, pas une par contrôle.**
 *
 * Ce script interroge quatre comptes sur des dizaines de vecteurs. Sans ce
 * cache, chaque contrôle rouvrait une session et le script finissait par se
 * faire refuser par Supabase — « Request rate limit reached », 30 vérifications
 * par heure. Constaté en ajoutant la section 4.
 *
 * Amusant et instructif : le plafond qui a cassé ce script est exactement celui
 * qui protège la connexion du bourrage de mots de passe.
 */
const sessions = new Map();

async function session(email) {
  const dejaOuverte = sessions.get(email);
  if (dejaOuverte) return dejaOuverte;

  const ouverte = await ouvrirSession(email);
  sessions.set(email, ouverte);
  return ouverte;
}

async function ouvrirSession(email) {
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

/**
 * Chaque table dit **ce qu'on attend**, pas « moins que l'administration ».
 *
 * Une première version comparait les volumes et criait au loup : un partenaire
 * voit légitimement tous les appels d'offres ouverts de sa ville et de ses
 * catégories — c'est même la raison d'être du tunnel. Ce qu'il ne doit pas
 * voir, c'est un **brouillon**. Un contrôle qui se trompe d'alerte finit par
 * n'être plus lu.
 */
const SONDES = [
  {
    table: "notifications",
    intitule: "file de notifications",
    attendu: () => 0,
    pourquoi: "elle dit quels concurrents ont été prévenus",
  },
  {
    table: "audit_logs",
    intitule: "journal d'audit",
    attendu: () => 0,
    pourquoi: "il retrace toute l'activité de la plateforme",
  },
  {
    table: "kyc_documents",
    intitule: "dossiers KYC",
    attendu: () => 0,
    pourquoi: "pièces d'identité et relevés bancaires",
  },
  {
    table: "profiles",
    intitule: "profils",
    attendu: () => 1,
    pourquoi: "chacun ne voit que le sien",
  },
];

for (const sonde of SONDES) {
  const { count: vuParAdmin } = await admin.client
    .from(sonde.table)
    .select("*", { count: "exact", head: true });

  const lignes = [];

  for (const compte of COMPTES) {
    const { client } = await session(compte.email);
    const { count } = await client.from(sonde.table).select("*", { count: "exact", head: true });
    const vu = count ?? 0;
    lignes.push(`${compte.titre} ${vu}`);

    if (vu > sonde.attendu()) {
      rate(`${compte.titre} voit ${vu} ${sonde.intitule} (attendu ${sonde.attendu()}) — ${sonde.pourquoi}`);
    }
  }

  console.log(`  ✓ ${sonde.intitule.padEnd(24)} admin ${String(vuParAdmin ?? 0).padEnd(4)} | ${lignes.join(" · ")}`);
}

// Les appels d'offres suivent une autre règle : un partenaire doit voir ceux
// qui le concernent, jamais ceux qu'un client n'a pas encore publiés.
const { count: brouillons } = await admin.client
  .from("quote_requests")
  .select("*", { count: "exact", head: true })
  .in("status", ["draft", "pending_approval"]);

for (const compte of COMPTES) {
  const { client, userId } = await session(compte.email);
  const { data } = await client.from("quote_requests").select("reference, status, requester_id");
  const indus = (data ?? []).filter(
    (r) => ["draft", "pending_approval"].includes(r.status) && r.requester_id !== userId,
  );

  if (indus.length > 0) rate(`${compte.titre} voit ${indus.length} demande(s) non publiée(s) d'autrui`);
}

console.log(
  `  ✓ ${"demandes non publiées".padEnd(24)} ${brouillons ?? 0} en base | aucune visible hors de son auteur`,
);

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

// ---------------------------------------------------------------------------
// 4. Les colonnes sensibles, demandées nommément
//
// ⚠️ **C'est ici que ce contrôle doit vivre, et nulle part ailleurs.** PGlite
// ne reproduit pas les droits par défaut de Supabase (§3 du guide) : un test
// local « cette colonne n'est pas lisible » passe sans rien prouver. Seule la
// vraie base répond.
//
// Et il faut demander la colonne **par son nom** : un `select *` ne la
// réclamerait plus une fois retirée du `grant`, et le contrôle serait vert
// pour la mauvaise raison. Trois fuites ont été refermées ainsi — le téléphone
// des organisations (0036), le jeton d'invitation (0042), puis le taux de
// commission et le téléphone du client (0044).
console.log("\n4. Les colonnes sensibles, demandées nommément");

const SECRETES = [
  {
    table: "partner_profiles",
    colonne: "commission_rate_override",
    quoi: "taux de commission négocié",
  },
  { table: "quote_requests", colonne: "contact_phone", quoi: "téléphone du client" },
  { table: "organizations", colonne: "phone", quoi: "téléphone du partenaire" },
  { table: "organizations", colonne: "billing_email", quoi: "adresse de facturation" },
  { table: "organization_invitations", colonne: "token", quoi: "jeton d'invitation" },
];

/** Un visiteur, sans la moindre session : le lecteur le plus défavorisé. */
const visiteur = createClient(url, key, { auth: { persistSession: false } });

for (const { table, colonne, quoi } of SECRETES) {
  const refus = [];

  for (const compte of [...COMPTES, { titre: "Visiteur", email: null }]) {
    const client = compte.email ? (await session(compte.email)).client : visiteur;
    const { data, error } = await client.from(table).select(colonne).limit(1);

    // Un refus de droit lève ; une ligne rendue avec la colonne est une fuite.
    if (error) refus.push(compte.titre);
    else if (data?.length && data[0][colonne] !== undefined) {
      rate(`${compte.titre} lit ${table}.${colonne} (${quoi})`);
    } else refus.push(compte.titre);
  }

  if (refus.length === COMPTES.length + 1) {
    console.log(`  ✓ ${`${table}.${colonne}`.padEnd(44)} refusé à tous — ${quoi}`);
  }
}

console.log("");
if (echecs > 0) {
  console.error(`${echecs} faille(s).`);
  process.exit(1);
}
console.log("Le back-office est clos.");
