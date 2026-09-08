import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Approvisionnement à l'inscription.
 *
 * Le compte, le profil, l'organisation et l'appartenance naissent ensemble ou
 * pas du tout. On vérifie surtout ce qu'un client mal intentionné pourrait
 * tenter : se déclarer administrateur au moment de s'inscrire.
 */

let db: TestDatabase;
let counter = 0;

/** Simule une inscription : c'est exactement ce que fait `supabase.auth.signUp`. */
async function signUp(metadata: Record<string, unknown>) {
  counter += 1;
  const email = `user${counter}@exemple.ci`;
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
    [email, JSON.stringify(metadata)],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db?.close();
});

describe("particulier", () => {
  it("obtient un profil, sans organisation", async () => {
    const userId = await signUp({ full_name: "Awa Koné", account_type: "particulier" });

    const profile = await db.query(
      "select full_name, account_type from profiles where id = $1",
      [userId],
    );
    expect(profile.rows[0]).toMatchObject({
      full_name: "Awa Koné",
      account_type: "particulier",
    });

    const members = await db.query("select id from organization_members where user_id = $1", [
      userId,
    ]);
    expect(members.rows).toHaveLength(0);
  });

  it("reste particulier même en fournissant un nom d'entreprise", async () => {
    const userId = await signUp({
      full_name: "Koffi",
      account_type: "particulier",
      company_name: "Tentative SARL",
    });

    const members = await db.query("select id from organization_members where user_id = $1", [
      userId,
    ]);
    expect(members.rows).toHaveLength(0);
  });
});

describe("partenaire", () => {
  it("obtient une organisation partenaire dont il est propriétaire", async () => {
    const userId = await signUp({
      full_name: "Traiteur Délice",
      account_type: "partenaire",
      company_name: "Traiteur Délice CI",
      city: "Abidjan",
      country: "CI",
    });

    const { rows } = await db.query(
      `select o.type, o.legal_name, o.slug, o.status, m.role, m.status as member_status
       from organization_members m join organizations o on o.id = m.org_id
       where m.user_id = $1`,
      [userId],
    );

    expect(rows[0]).toMatchObject({
      type: "partner",
      legal_name: "Traiteur Délice CI",
      slug: "traiteur-delice-ci",
      status: "active",
      role: "owner",
      member_status: "active",
    });
  });

  it("obtient une fiche partenaire pré-remplie avec sa ville", async () => {
    const userId = await signUp({
      account_type: "partenaire",
      company_name: "Décor Abidjan",
      city: "Abidjan",
    });

    const { rows } = await db.query(
      `select p.service_cities, p.is_verified
       from partner_profiles p
       join organization_members m on m.org_id = p.org_id
       where m.user_id = $1`,
      [userId],
    );

    expect(rows[0].service_cities).toEqual(["Abidjan"]);
    // Le badge « vérifié » se gagne après contrôle des pièces, pas à l'inscription.
    expect(rows[0].is_verified).toBe(false);
  });

  it("dérive un slug lisible et sans accent", async () => {
    const userId = await signUp({
      account_type: "partenaire",
      company_name: "Événements & Réceptions Élégance",
    });

    const { rows } = await db.query(
      `select o.slug from organization_members m join organizations o on o.id = m.org_id
       where m.user_id = $1`,
      [userId],
    );
    expect(rows[0].slug).toBe("evenements-receptions-elegance");
  });

  it("distingue deux entreprises homonymes", async () => {
    const first = await signUp({ account_type: "partenaire", company_name: "Sono Pro" });
    const second = await signUp({ account_type: "partenaire", company_name: "Sono Pro" });

    const { rows } = await db.query(
      `select o.slug from organization_members m join organizations o on o.id = m.org_id
       where m.user_id = any($1::uuid[]) order by o.created_at`,
      [[first, second]],
    );

    expect(rows.map((r) => r.slug)).toEqual(["sono-pro", "sono-pro-2"]);
  });
});

describe("entreprise cliente", () => {
  it("obtient une organisation de type entreprise", async () => {
    const userId = await signUp({
      full_name: "Clara",
      account_type: "entreprise",
      company_name: "ACME Côte d'Ivoire",
      city: "Abidjan",
    });

    const { rows } = await db.query(
      `select o.type, m.role from organization_members m join organizations o on o.id = m.org_id
       where m.user_id = $1`,
      [userId],
    );
    expect(rows[0]).toMatchObject({ type: "company", role: "owner" });
  });

  it("n'obtient pas de fiche partenaire", async () => {
    const userId = await signUp({
      account_type: "entreprise",
      company_name: "Bolloré Logistics CI",
    });

    const { rows } = await db.query(
      `select p.org_id from partner_profiles p
       join organization_members m on m.org_id = p.org_id
       where m.user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("élévation de privilèges", () => {
  it("refuse de créer un administrateur depuis le formulaire d'inscription", async () => {
    // Le client contrôle entièrement `raw_user_meta_data` : il peut y écrire
    // ce qu'il veut. Le déclencheur doit donc ignorer « admin ».
    const userId = await signUp({ full_name: "Pirate", account_type: "admin" });

    const { rows } = await db.query("select account_type from profiles where id = $1", [userId]);
    expect(rows[0].account_type).toBe("particulier");
  });

  it("ne laisse pas non plus passer un rôle d'organisation choisi par le client", async () => {
    // `role` n'est jamais lu depuis les métadonnées : le créateur est propriétaire,
    // et rien d'autre ne peut être demandé à l'inscription.
    const userId = await signUp({
      account_type: "partenaire",
      company_name: "Test Rôle",
      role: "admin",
    });

    const { rows } = await db.query(
      "select role from organization_members where user_id = $1",
      [userId],
    );
    expect(rows[0].role).toBe("owner");
  });
});
