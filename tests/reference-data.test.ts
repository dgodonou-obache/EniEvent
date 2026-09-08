import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Le référentiel de catégories fait partie du produit : une famille manquante
 * ou une nature incohérente se verrait directement dans la navigation et dans
 * les filtres de recherche.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db?.close();
});

describe("arborescence des catégories", () => {
  it("contient les huit familles", async () => {
    const { rows } = await db.query(
      "select slug from categories where parent_id is null order by sort_order",
    );

    expect(rows.map((r) => r.slug)).toEqual([
      "lieux",
      "restauration",
      "ambiance",
      "animation",
      "logistique",
      "image",
      "conseil",
      "beaute",
    ]);
  });

  it("couvre les catégories explicitement demandées au cahier des charges", async () => {
    const { rows } = await db.query("select slug from categories");
    const slugs = rows.map((r) => r.slug);

    for (const required of [
      "decoration",
      "traiteur",
      "location-equipement",
      "maitre-de-ceremonie",
      "salle-de-reception",
      "dj-sonorisation",
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it("range tous les lieux sous la famille Lieux, et rien d'autre", async () => {
    const { rows } = await db.query(
      "select count(*)::int as total from categories where kind = 'venue' and parent_id is not null",
    );
    const { rows: underLieux } = await db.query(`
      select count(*)::int as total
      from categories c join categories p on p.id = c.parent_id
      where p.slug = 'lieux'
    `);

    expect(rows[0].total).toBe(underLieux[0].total);
  });

  it("n'a aucune catégorie orpheline ni auto-référencée", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from categories c
      where c.parent_id is not null
        and not exists (select 1 from categories p where p.id = c.parent_id)
    `);
    expect(rows[0].total).toBe(0);
  });

  it("refuse une sous-catégorie contredisant la nature de sa famille", async () => {
    // « Traiteur » sous « Lieux » : la clé étrangère composite l'interdit.
    await expect(
      db.exec(`
        insert into categories (kind, slug, name, parent_id)
        select 'service', 'traiteur-mal-range', 'Traiteur mal rangé', id
        from categories where slug = 'lieux';
      `),
    ).rejects.toThrow(/categories_parent_kind_fkey|foreign key/i);
  });

  it("accepte une nouvelle sous-catégorie cohérente", async () => {
    const { rows } = await db.query(`
      insert into categories (kind, slug, name, parent_id)
      select 'venue', 'salle-de-sport', 'Salle de sport', id
      from categories where slug = 'lieux'
      returning slug
    `);
    expect(rows[0].slug).toBe("salle-de-sport");
  });
});

describe("équipements", () => {
  it("distingue ceux qui s'appliquent aux lieux de ceux qui s'appliquent aux services", async () => {
    const { rows } = await db.query(
      "select applies_to, count(*)::int as total from amenities group by applies_to order by applies_to",
    );

    const byKind = Object.fromEntries(rows.map((r) => [String(r.applies_to), r.total]));
    expect(byKind.venue).toBeGreaterThan(10);
    expect(byKind.service).toBeGreaterThan(3);
  });

  it("propose les équipements déterminants sur le marché béninois", async () => {
    const { rows } = await db.query("select slug from amenities");
    const slugs = rows.map((r) => r.slug);

    // Le groupe électrogène et la climatisation sont des critères de choix
    // décisifs pour un événement à Cotonou.
    expect(slugs).toContain("groupe-electrogene");
    expect(slugs).toContain("climatisation");
    expect(slugs).toContain("acces-pmr");
  });
});

describe("villes", () => {
  it("couvre le Bénin, du littoral au nord", async () => {
    const { rows } = await db.query(
      "select slug from cities where country = 'BJ' order by sort_order",
    );
    const slugs = rows.map((r) => r.slug);

    expect(slugs[0]).toBe("cotonou");
    expect(slugs).toContain("porto-novo");
    expect(slugs).toContain("parakou");
    expect(slugs).toContain("natitingou");
  });

  it("géolocalise chaque ville", async () => {
    // Sans coordonnées, ni la vue carte ni le tri par proximité ne fonctionnent.
    const { rows } = await db.query(
      "select count(*)::int as total from cities where latitude is null or longitude is null",
    );
    expect(rows[0].total).toBe(0);
  });
});
