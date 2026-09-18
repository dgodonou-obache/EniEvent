/**
 * Pousse les gabarits d'e-mails d'authentification chez Supabase.
 *
 *   npm run mails:auth              # simulation : montre ce qui changerait
 *   npm run mails:auth -- --appliquer
 *
 * **Pourquoi un script.** Supabase Auth expédie lui-même ces messages —
 * confirmation d'adresse, réinitialisation de mot de passe, lien de connexion —
 * depuis des gabarits qu'il garde dans sa propre configuration. Ils échappent
 * donc à Git par nature. Ce script rend le dépôt à nouveau source de vérité :
 * le contenu vit dans `src/lib/notify/auth-emails.ts`, est couvert par des
 * tests, et Supabase n'en détient qu'une copie qu'on republie à volonté.
 *
 * Il importe directement le module TypeScript : Node 24 efface les types au
 * chargement. Aucune étape de compilation, donc aucun risque de pousser autre
 * chose que ce que la suite de tests vérifie.
 */
import { AUTH_TEMPLATES, LIEN_VALIDITE_SECONDES } from "../src/lib/notify/auth-emails.ts";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const APPLIQUER = process.argv.includes("--appliquer");

if (!token || !ref) {
  console.error(
    "SUPABASE_ACCESS_TOKEN et SUPABASE_PROJECT_REF sont requis. Lancez avec --env-file=.env.local",
  );
  process.exit(1);
}

const URL_CONFIG = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

async function config(method, body) {
  const res = await fetch(URL_CONFIG, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const texte = await res.text();
  if (!res.ok) throw new Error(`${method} config/auth → HTTP ${res.status} : ${texte.slice(0, 400)}`);
  return texte ? JSON.parse(texte) : null;
}

const actuel = await config("GET");

// La durée annoncée dans les textes (« valable une heure ») doit correspondre à
// celle que Supabase applique réellement. Un décalage ferait mentir le message
// à l'utilisateur, sans qu'aucun test ne puisse le voir depuis le dépôt.
if (actuel.mailer_otp_exp !== LIEN_VALIDITE_SECONDES) {
  console.warn(
    `⚠️  Les textes annoncent ${LIEN_VALIDITE_SECONDES} s de validité, ` +
      `Supabase applique ${actuel.mailer_otp_exp} s. Corrigez l'un ou l'autre.\n`,
  );
}

const charge = {};
let aChanger = 0;

console.log(APPLIQUER ? "--- Application ---\n" : "--- Simulation (ajouter -- --appliquer) ---\n");

for (const t of AUTH_TEMPLATES) {
  const cleSujet = `mailer_subjects_${t.key}`;
  const cleCorps = `mailer_templates_${t.key}_content`;

  const memeSujet = actuel[cleSujet] === t.subject;
  const memeCorps = actuel[cleCorps] === t.html;

  if (memeSujet && memeCorps) {
    console.log(`= ${t.nom.padEnd(30)} déjà à jour`);
    continue;
  }

  aChanger += 1;
  console.log(`~ ${t.nom.padEnd(30)} ${t.html.length} caractères`);
  console.log(`    avant : ${actuel[cleSujet] ?? "(défaut Supabase)"}`);
  console.log(`    après : ${t.subject}`);

  charge[cleSujet] = t.subject;
  charge[cleCorps] = t.html;
}

if (aChanger === 0) {
  console.log("\nRien à faire : les six gabarits sont déjà ceux du dépôt.");
  process.exit(0);
}

if (!APPLIQUER) {
  console.log(`\n${aChanger} gabarit(s) à publier. Rien n'a été modifié.`);
  process.exit(0);
}

await config("PATCH", charge);

// Relire plutôt que se fier au code de retour : l'API répond 200 en ignorant
// silencieusement un champ qu'elle ne connaît pas.
const apres = await config("GET");
let ecarts = 0;

for (const t of AUTH_TEMPLATES) {
  const ok =
    apres[`mailer_subjects_${t.key}`] === t.subject &&
    apres[`mailer_templates_${t.key}_content`] === t.html;
  if (!ok) {
    console.error(`✗ ${t.nom} : Supabase n'a pas retenu la valeur envoyée`);
    ecarts += 1;
  }
}

if (ecarts > 0) process.exit(1);
console.log(`\n✓ ${AUTH_TEMPLATES.length} gabarits publiés et relus depuis Supabase.`);
