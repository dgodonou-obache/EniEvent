import { readFile } from "node:fs/promises";

/**
 * Exécute un fichier SQL sur le projet Supabase lié, via l'API de gestion.
 *
 *   node --env-file=.env.local scripts/db-exec.mjs supabase/seed.sql
 *
 * Pourquoi ne pas se contenter de `supabase db push --include-seed` : le CLI
 * suit les seeds par empreinte, et s'est contenté d'enregistrer la nouvelle
 * empreinte sans rejouer le fichier lorsqu'il avait déjà été appliqué. Or un
 * seed écrit pour être rejouable (`on conflict do nothing`) doit pouvoir l'être
 * à volonté. Ce script ne suit aucune empreinte : il exécute, point.
 *
 * Réservé au développement — il exécute du SQL arbitraire avec les pleins
 * pouvoirs. Ne jamais l'appeler depuis le code applicatif.
 */

const [, , file] = process.argv;

if (!file) {
  console.error("Usage : node --env-file=.env.local scripts/db-exec.mjs <fichier.sql>");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error(
    "SUPABASE_ACCESS_TOKEN et SUPABASE_PROJECT_REF sont requis. Lancez avec --env-file=.env.local",
  );
  process.exit(1);
}

const sql = await readFile(file, "utf8");

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const payload = await response.text();

if (!response.ok) {
  console.error(`Échec (${response.status}) :`);
  console.error(payload.slice(0, 2000));
  process.exit(1);
}

console.log(`${file} appliqué (${sql.length} caractères).`);

// Le point de terminaison renvoie le résultat de la dernière instruction.
try {
  const rows = JSON.parse(payload);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`${rows.length} ligne(s) retournée(s) par la dernière instruction.`);
  }
} catch {
  // Réponse sans corps exploitable : rien à signaler.
}
