import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Élévation de privilèges par les colonnes.
 *
 * **La RLS dit quelles lignes on peut modifier, jamais quelles colonnes.** Une
 * politique `using (id = auth.uid())` laisse donc écrire *tout* ce que les
 * droits de colonne autorisent — y compris ce qui définit les privilèges.
 *
 * Quatre attaques réussissaient contre la base réelle avant la migration 0021 :
 * se promouvoir administrateur, s'auto-décerner le badge « vérifié », activer
 * son organisation sans validation, prendre le rôle de propriétaire. Chacune
 * est rejouée ici.
 *
 * ⚠️ Une écriture bloquée par les droits de colonne lève une vraie erreur ; une
 * écriture bloquée par une clause `using` n'en lève aucune et touche 0 ligne.
 * Ces tests vérifient donc **l'état après coup**, pas seulement l'erreur.
 */

const PARTENAIRE = "7a000000-0000-4000-8000-00000000000a";
const MEMBRE = "b0000000-0000-4000-8000-00000000000b";

let db: TestDatabase;
let org: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PARTENAIRE}', 'chef@saveurs.bj', '{"account_type":"partenaire"}'),
      ('${MEMBRE}',     'aide@saveurs.bj', '{"account_type":"partenaire"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status)
    values ('partner', 'Saveurs du Benin', 'saveurs', 'pending')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query(
    `insert into organization_members (org_id, org_type, user_id, role) values
       ($1, 'partner', $2, 'owner'),
       ($1, 'partner', $3, 'staff')`,
    [org, PARTENAIRE, MEMBRE],
  );

  await db.query(`insert into partner_profiles (org_id, is_verified) values ($1, false)`, [org]);
});

afterAll(async () => {
  await db?.close();
});

/** Valeur actuelle, lue en dehors de toute RLS. */
async function valeur(table: string, colonne: string, where: string, params: unknown[]) {
  const { rows } = await db.query(`select ${colonne} as v from ${table} where ${where}`, params);
  return rows[0]?.v;
}

describe("élévation de privilèges", () => {
  it("interdit de se promouvoir administrateur", async () => {
    // L'attaque la plus grave : un seul appel PostgREST ouvrait tout le
    // back-office. `handle_new_user` refusait « admin » à l'inscription, ce qui
    // ne servait à rien puisqu'on pouvait se promouvoir juste après.
    await actingAs(db, PARTENAIRE, async () => {
      await db
        .query("update profiles set account_type = 'admin' where id = $1", [PARTENAIRE])
        .catch(() => undefined);
    });

    expect(await valeur("profiles", "account_type", "id = $1", [PARTENAIRE])).toBe("partenaire");
  });

  it("interdit de s'auto-décerner le badge « vérifié »", async () => {
    // Ce badge s'affiche au client sur chaque fiche : se le donner soi-même,
    // c'est fabriquer de la confiance.
    await actingAs(db, PARTENAIRE, async () => {
      await db
        .query("update partner_profiles set is_verified = true where org_id = $1", [org])
        .catch(() => undefined);
    });

    expect(await valeur("partner_profiles", "is_verified", "org_id = $1", [org])).toBe(false);
  });

  it("interdit d'activer sa propre organisation", async () => {
    await actingAs(db, PARTENAIRE, async () => {
      await db
        .query("update organizations set status = 'active' where id = $1", [org])
        .catch(() => undefined);
    });

    expect(await valeur("organizations", "status", "id = $1", [org])).toBe("pending");
  });

  it("interdit à un collaborateur de se faire propriétaire", async () => {
    // Celle-ci était déjà bloquée par la politique RLS, qui exige un rôle
    // dirigeant — mais **sans lever d'erreur** : la ligne est invisible, la
    // requête réussit en touchant 0 ligne. D'où la vérification de l'état.
    await actingAs(db, MEMBRE, async () => {
      await db
        .query("update organization_members set role = 'owner' where user_id = $1", [MEMBRE])
        .catch(() => undefined);
    });

    expect(await valeur("organization_members", "role", "user_id = $1", [MEMBRE])).toBe("staff");
  });
});

describe("ce qui reste permis", () => {
  it("laisse modifier son nom et son téléphone", async () => {
    // Refermer trop large casserait l'espace personnel : le but est de bloquer
    // les privilèges, pas l'identité.
    await actingAs(db, PARTENAIRE, async () => {
      await db.query("update profiles set full_name = 'Chef Kossi' where id = $1", [PARTENAIRE]);
    });

    expect(await valeur("profiles", "full_name", "id = $1", [PARTENAIRE])).toBe("Chef Kossi");
  });

  it("laisse modifier les coordonnées de son organisation", async () => {
    // C'est ce qu'écrit /entreprise/parametres — la seule écriture applicative
    // sur cette table.
    await actingAs(db, PARTENAIRE, async () => {
      await db.query(
        "update organizations set legal_name = 'Saveurs SARL', city = 'Cotonou' where id = $1",
        [org],
      );
    });

    expect(await valeur("organizations", "legal_name", "id = $1", [org])).toBe("Saveurs SARL");
  });

  it("laisse un partenaire écrire sa présentation", async () => {
    await actingAs(db, PARTENAIRE, async () => {
      await db.query("update partner_profiles set bio = 'Cuisine beninoise' where org_id = $1", [org]);
    });

    expect(await valeur("partner_profiles", "bio", "org_id = $1", [org])).toBe("Cuisine beninoise");
  });
});
