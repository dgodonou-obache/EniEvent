import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, "..", "..");
const migrationsDir = join(projectRoot, "supabase", "migrations");

/**
 * Démarre un Postgres jetable (PGlite), y rejoue le shim Supabase puis toutes
 * les migrations dans l'ordre.
 *
 * C'est ce qui permet de valider le schéma et la RLS sans Docker ni projet
 * Supabase : le SQL exécuté ici est exactement celui qui sera poussé ensuite.
 */
export async function createTestDatabase({ seed = false } = {}) {
  const db = await PGlite.create({ extensions: { pg_trgm, citext, btree_gist } });

  await runSql(db, await readFile(join(here, "supabase-shim.sql"), "utf8"), "supabase-shim.sql");

  for (const file of await migrationFiles()) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await runSql(db, sql, file);
  }

  if (seed) {
    const sql = await readFile(join(projectRoot, "supabase", "seed.sql"), "utf8");
    await runSql(db, sql, "seed.sql");
  }

  return db;
}

export async function migrationFiles() {
  const entries = await readdir(migrationsDir);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

async function runSql(db, sql, label) {
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`[${label}] ${error.message}`, { cause: error });
  }
}

/**
 * Exécute une fonction en se faisant passer pour un utilisateur donné.
 *
 * Reproduit ce que fait PostgREST : basculer sur le rôle `authenticated` (ou
 * `anon`) et publier les revendications du JWT dans la configuration de session,
 * là où `auth.uid()` va les lire. C'est la seule façon de tester une politique
 * RLS pour de vrai — l'interroger en superutilisateur ne prouve rien, la RLS
 * étant contournée.
 */
export async function actingAs(db, userId, fn) {
  const role = userId ? "authenticated" : "anon";
  const claims = userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role });

  // Portée session, pas `SET LOCAL` : hors transaction, `SET LOCAL` se contente
  // d'émettre un avertissement et ne change rien — les requêtes tourneraient
  // alors en superutilisateur, qui contourne la RLS, et tout test passerait.
  await db.exec(`set role ${role};`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);

  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/**
 * Garde-fou du banc d'essai lui-même : vérifie qu'en se faisant passer pour un
 * utilisateur, on a bien perdu les privilèges de superutilisateur.
 */
export async function assertRlsApplies(db) {
  const result = await actingAs(db, "00000000-0000-0000-0000-000000000001", async () => {
    const role = await db.query("select current_user as role, auth.uid() as uid");
    const bypasses = await db.query(
      "select bool_or(rolbypassrls) as bypasses from pg_roles where rolname = current_user",
    );
    return { ...role.rows[0], ...bypasses.rows[0] };
  });

  if (result.role !== "authenticated" || result.bypasses) {
    throw new Error(
      `Le banc d'essai ne simule pas correctement un utilisateur : role=${result.role}, bypassrls=${result.bypasses}`,
    );
  }

  return result;
}
