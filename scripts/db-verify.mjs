import { createTestDatabase, migrationFiles } from "./lib/harness.mjs";

/**
 * Rejoue toutes les migrations dans un Postgres jetable et affiche l'état du
 * schéma. Sert de garde-fou rapide : `node scripts/db-verify.mjs`.
 */

const files = await migrationFiles();
console.log(`Migrations à appliquer : ${files.length}`);
for (const file of files) console.log(`  · ${file}`);
console.log();

const started = Date.now();
let db;

try {
  db = await createTestDatabase();
} catch (error) {
  console.error("ÉCHEC :", error.message);
  process.exit(1);
}

console.log(`Schéma appliqué en ${Date.now() - started} ms.\n`);

const tables = await db.query(`
  select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);

console.log("Table                          RLS   Politiques");
console.log("-".repeat(50));
for (const row of tables.rows) {
  console.log(
    `${row.table_name.padEnd(30)} ${row.rls_enabled ? "oui" : "NON"}   ${row.policies}`,
  );
}

// Une table publique sans RLS est une fuite de données : le règlement du projet
// impose la RLS partout, donc on échoue plutôt que de l'signaler discrètement.
const unprotected = tables.rows.filter((row) => !row.rls_enabled);
if (unprotected.length > 0) {
  console.error(
    `\nÉCHEC : ${unprotected.length} table(s) sans RLS — ${unprotected
      .map((row) => row.table_name)
      .join(", ")}`,
  );
  await db.close();
  process.exit(1);
}

const withoutPolicies = tables.rows.filter((row) => Number(row.policies) === 0);
if (withoutPolicies.length > 0) {
  console.error(
    `\nÉCHEC : RLS active mais aucune politique — ${withoutPolicies
      .map((row) => row.table_name)
      .join(", ")}. La table serait totalement inaccessible.`,
  );
  await db.close();
  process.exit(1);
}

console.log(`\nOK — ${tables.rows.length} tables, toutes protégées par RLS.`);
await db.close();
