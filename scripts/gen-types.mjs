import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { projectRoot } from "./lib/harness.mjs";

/**
 * Régénère `src/types/database.ts` depuis le projet Supabase lié.
 *
 * Passe par Node plutôt que par une redirection shell : sous Windows, `>` écrit
 * avec la page de codes de la console (voire un BOM), ce qui corrompt le fichier
 * généré. Ici l'écriture est explicitement en UTF-8 sans BOM.
 */

const run = promisify(exec);
const target = join(projectRoot, "src", "types", "database.ts");

// Commande passée en une seule chaîne : sous Windows, `spawn` refuse d'exécuter
// directement `npx.cmd` (EINVAL depuis Node 20), et passer un tableau d'arguments
// avec `shell: true` déclenche un avertissement de dépréciation. Aucune donnée
// externe n'entre dans cette commande.
const { stdout } = await run("npx supabase gen types typescript --linked", {
  cwd: projectRoot,
  maxBuffer: 32 * 1024 * 1024,
});

if (!stdout.includes("export type Database")) {
  console.error("Sortie inattendue du CLI Supabase — fichier non écrit.");
  console.error(stdout.slice(0, 500));
  process.exit(1);
}

const header = [
  "/**",
  " * Types de la base Supabase.",
  " *",
  " * ⚠️ Fichier généré — ne pas éditer à la main.",
  " * Régénérer après chaque migration :  npm run db:types",
  " */",
  "",
  "",
].join("\n");

await writeFile(target, header + stdout, "utf8");
console.log(`src/types/database.ts régénéré (${stdout.length} caractères).`);
