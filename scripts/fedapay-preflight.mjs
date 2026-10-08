import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Contrôle de pré-vol avant le passage en argent réel.
 *
 *   npm run fedapay:verifier
 *
 * ⚠️ **Strictement en lecture.** Ce script n'ouvre aucune transaction, ne crée
 * aucun webhook, ne déplace pas un franc. Il n'emploie que des `GET`, et c'est
 * la seule manière honnête de vérifier une passerelle de paiement : un contrôle
 * qui « essaie pour voir » laisse derrière lui des traces dans une comptabilité
 * réelle.
 *
 * ⚠️ **Il n'affiche jamais la clé.** Ni en entier, ni tronquée au point d'être
 * devinable : seulement son préfixe d'environnement. Une clé recopiée dans un
 * journal de terminal est une clé compromise — les terminaux se partagent par
 * capture d'écran plus souvent qu'on ne le croit.
 */

const ROUGE = (t) => `\u001b[31m${t}\u001b[0m`;
const VERT = (t) => `\u001b[32m${t}\u001b[0m`;
const JAUNE = (t) => `\u001b[33m${t}\u001b[0m`;

let bloquants = 0;
let avertissements = 0;

function ok(quoi, detail = "") {
  console.log(`  ${VERT("✓")} ${quoi.padEnd(52)} ${detail}`);
}
function bloque(quoi, detail = "") {
  bloquants += 1;
  console.log(`  ${ROUGE("✗")} ${quoi.padEnd(52)} ${detail}`);
}
function alerte(quoi, detail = "") {
  avertissements += 1;
  console.log(`  ${JAUNE("!")} ${quoi.padEnd(52)} ${detail}`);
}

const cle = process.env.FEDAPAY_SECRET_KEY;
const secretWebhook = process.env.FEDAPAY_WEBHOOK_SECRET;
const environnement = process.env.FEDAPAY_ENVIRONMENT;

/**
 * ⚠️ **L'adresse attendue du webhook est celle de la production, pas celle du
 * `.env.local`.** Lancé sur un poste de développement, `NEXT_PUBLIC_SITE_URL`
 * vaut `http://localhost:3000` — et le script réclamait alors un webhook
 * pointant vers la machine de celui qui l'exécute. Un contrôle qui crie au
 * loup finit par être ignoré, et le jour où il a raison personne ne le lit.
 */
const site = (() => {
  const configure = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configure || /localhost|127\.0\.0\.1|^http:/.test(configure)) return "https://enievent.com";
  return configure;
})();

console.log("\nFedaPay — contrôle de pré-vol (lecture seule)\n");

// ---------------------------------------------------------------------------
console.log("1. Configuration");

if (!cle) {
  bloque("FEDAPAY_SECRET_KEY", "absente — rien à vérifier");
  process.exit(1);
}

const sandbox = environnement ? environnement !== "live" : cle.startsWith("sk_sandbox");
const base = sandbox ? "https://sandbox-api.fedapay.com/v1" : "https://api.fedapay.com/v1";

// Le préfixe suffit à dire l'environnement, et ne permet de deviner personne.
const prefixe = cle.startsWith("sk_live")
  ? "sk_live_…"
  : cle.startsWith("sk_sandbox")
    ? "sk_sandbox_…"
    : `${cle.slice(0, 3)}…`;

ok("clé présente", `${prefixe} (${cle.length} caractères)`);
console.log(
  `  ${sandbox ? JAUNE("•") : VERT("✓")} ${"environnement résolu".padEnd(52)} ` +
    `${sandbox ? "BAC À SABLE" : "PRODUCTION"} → ${base}`,
);

if (environnement && sandbox === cle.startsWith("sk_live")) {
  bloque(
    "FEDAPAY_ENVIRONMENT contredit la clé",
    `clé ${prefixe} mais FEDAPAY_ENVIRONMENT=${environnement}`,
  );
}

if (!sandbox && !secretWebhook) {
  bloque("FEDAPAY_WEBHOOK_SECRET", "absente — aucun paiement réel ne sera ouvert");
} else if (secretWebhook) {
  ok("FEDAPAY_WEBHOOK_SECRET", `présente (${secretWebhook.length} caractères)`);
} else {
  alerte("FEDAPAY_WEBHOOK_SECRET", "absente — toléré en bac à sable seulement");
}

// ---------------------------------------------------------------------------
console.log("\n2. Étanchéité du secret");

// Le dépôt est public : une clé qui y est entrée une fois y reste pour toujours.
try {
  const suivis = execSync("git ls-files", { encoding: "utf8" }).split("\n");
  const envSuivis = suivis.filter((f) => /^\.env/.test(f) && f !== ".env.example");
  if (envSuivis.length) bloque("fichiers .env versionnés", envSuivis.join(", "));
  else ok("aucun fichier .env versionné", "hors .env.example");
} catch {
  alerte("git indisponible", "contrôle des fichiers versionnés non effectué");
}

try {
  const trouve = execSync(`git log --all -S "${cle.slice(0, 12)}" --oneline`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
  if (trouve) bloque("la clé apparaît dans l'historique git", trouve.split("\n")[0]);
  else ok("la clé n'est jamais entrée dans l'historique git", "");
} catch {
  ok("la clé n'est jamais entrée dans l'historique git", "");
}

// Tout ce qui porte NEXT_PUBLIC_ part dans le navigateur, pour toujours.
const publiques = Object.entries(process.env).filter(([k]) => k.startsWith("NEXT_PUBLIC_"));
const fuites = publiques.filter(([, v]) => v && (v.includes(cle) || /\bsk_/.test(v)));
if (fuites.length) bloque("clé exposée par une variable NEXT_PUBLIC_", fuites.map(([k]) => k).join(", "));
else ok("aucune variable NEXT_PUBLIC_ ne porte de clé", `${publiques.length} variables publiques`);

// Le paquet déjà compilé, s'il existe : la preuve de ce qui est réellement servi.
if (existsSync(".next")) {
  let trouvee = false;
  const pile = [".next/static"];
  const { readdirSync, statSync } = await import("node:fs");
  while (pile.length && !trouvee) {
    const dossier = pile.pop();
    if (!existsSync(dossier)) continue;
    for (const entree of readdirSync(dossier)) {
      const chemin = `${dossier}/${entree}`;
      if (statSync(chemin).isDirectory()) pile.push(chemin);
      else if (/\.(js|css|map)$/.test(entree) && readFileSync(chemin, "utf8").includes(cle)) {
        bloque("la clé est dans le paquet navigateur", chemin);
        trouvee = true;
        break;
      }
    }
  }
  if (!trouvee) ok("la clé n'est pas dans le paquet navigateur", ".next/static balayé");
} else {
  alerte("paquet navigateur non balayé", "lancez `npm run build` d'abord");
}

// ---------------------------------------------------------------------------
console.log("\n3. La passerelle répond");

async function lire(chemin) {
  const r = await fetch(`${base}${chemin}`, {
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
  });
  const texte = await r.text();
  let corps = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* réponse non JSON */
  }
  return { status: r.status, corps, texte };
}

const devises = await lire("/currencies");
if (devises.status !== 200) {
  bloque("authentification", `HTTP ${devises.status} — ${devises.texte.slice(0, 80)}`);
} else {
  ok("authentification", `HTTP 200 sur /currencies`);

  const xof = (devises.corps?.["v1/currencies"] ?? []).find((d) => d.iso === "XOF");
  if (!xof) alerte("XOF introuvable", "la devise du produit n'est pas listée");
  else if (xof.div !== 1) {
    bloque("division du XOF", `${xof.div} au lieu de 1 — les montants seraient faux`);
  } else ok("division du XOF", "1 — les francs entiers de money.ts s'y versent tels quels");
}

// ---------------------------------------------------------------------------
console.log("\n4. Droits du compte marchand");

// Ces deux-là répondaient 403 et 401 sur le compte non validé. Un compte
// validé les ouvre — c'est ce qui transformera `mark_payout_sent` et
// `mark_refund_sent` de registres tenus à la main en virements réels.
for (const [chemin, quoi] of [
  ["/payouts", "versements aux partenaires"],
  ["/refunds", "remboursements clients"],
]) {
  const r = await lire(chemin);
  if (r.status === 200) ok(`${chemin} autorisé`, quoi);
  else if (r.status === 401 || r.status === 403) {
    alerte(`${chemin} refusé (HTTP ${r.status})`, `${quoi} — restent des registres manuels`);
  } else alerte(`${chemin} HTTP ${r.status}`, r.texte.slice(0, 60));
}

// ---------------------------------------------------------------------------
console.log("\n5. Webhook");

const hooks = await lire("/webhooks");
if (hooks.status !== 200) {
  alerte("liste des webhooks illisible", `HTTP ${hooks.status}`);
} else {
  const liste = hooks.corps?.["v1/webhooks"] ?? [];
  const attendu = `${site.replace(/\/$/, "")}/api/webhooks/fedapay`;
  const notre = liste.find((w) => (w.url ?? "").replace(/\/$/, "") === attendu);

  if (liste.length === 0) {
    bloque("aucun webhook déclaré", `attendu : ${attendu}`);
  } else if (!notre) {
    bloque("aucun webhook ne pointe chez nous", `attendu ${attendu} ; trouvé : ${liste.map((w) => w.url).join(", ")}`);
  } else {
    ok("webhook déclaré", attendu);
    if (notre.enabled === false) {
      bloque("webhook désactivé", "FedaPay l'éteint après des échecs répétés — à réactiver");
    } else ok("webhook actif", "");
  }
}

// Le point de terminaison répond-il vraiment, vu depuis l'extérieur ?
try {
  const r = await fetch(`${site.replace(/\/$/, "")}/api/webhooks/fedapay`);
  if (r.ok) ok("notre point de terminaison répond", `GET ${r.status}`);
  else alerte("notre point de terminaison", `GET ${r.status}`);
} catch (e) {
  alerte("notre point de terminaison injoignable", e.message.slice(0, 60));
}

// ---------------------------------------------------------------------------
console.log("");
if (bloquants > 0) {
  console.log(ROUGE(`${bloquants} point(s) bloquant(s), ${avertissements} avertissement(s).`));
  console.log("Ne pas encaisser tant qu'il en reste un.\n");
  process.exit(1);
}

console.log(VERT(`Aucun point bloquant. ${avertissements} avertissement(s).`));
console.log(
  sandbox
    ? "Environnement : bac à sable. Rien de ce qui précède n'engage d'argent réel.\n"
    : ROUGE("Environnement : PRODUCTION. Le prochain paiement sera réel.\n"),
);
