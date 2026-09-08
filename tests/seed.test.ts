import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Le jeu de démonstration doit être exploitable tel quel pour construire le
 * catalogue : des annonces publiques, tarifées, avec des dates réservables.
 * Ces tests le vérifient et servent aussi de garde-fou contre un seed cassé,
 * qui se manifesterait autrement par un catalogue vide sans erreur visible.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase({ seed: true });
});

afterAll(async () => {
  await db?.close();
});

describe("jeu de démonstration", () => {
  it("couvre les principales villes béninoises", async () => {
    const { rows } = await actingAs(db, null, async () =>
      db.query("select distinct city from listings order by city"),
    );

    const cities = rows.map((r) => r.city);
    expect(cities).toContain("Cotonou");
    expect(cities).toContain("Porto-Novo");
    expect(cities).toContain("Abomey-Calavi");
    expect(cities).toContain("Ouidah");
  });

  it("n'expose aucune annonce hors du Bénin", async () => {
    // Le recentrage doit être total : une ville ivoirienne ou sénégalaise
    // oubliée dans le seed se retrouverait dans le filtre ville du catalogue.
    const { rows } = await db.query(`
      select count(*)::int as total
      from listings l
      where not exists (select 1 from cities c where c.name = l.city)
    `);
    expect(rows[0].total).toBe(0);
  });

  it("géolocalise les lieux pour la vue carte", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from listings
      where kind = 'venue' and (latitude is null or longitude is null)
    `);
    expect(rows[0].total).toBe(0);
  });

  it("couvre les lieux et les services", async () => {
    const { rows } = await actingAs(db, null, async () =>
      db.query("select kind, count(*)::int as total from listings group by kind"),
    );

    const byKind = Object.fromEntries(rows.map((r) => [String(r.kind), r.total]));
    expect(byKind.venue).toBeGreaterThanOrEqual(5);
    expect(byKind.service).toBeGreaterThanOrEqual(5);
  });

  it("rend toutes les annonces visibles au public", async () => {
    // Une annonce restée en brouillon dans le seed serait invisible et
    // donnerait l'illusion d'un bug d'affichage côté catalogue.
    const visible = await actingAs(db, null, async () =>
      db.query("select count(*)::int as total from listings"),
    );
    const all = await db.query("select count(*)::int as total from listings");

    expect(visible.rows[0].total).toBe(all.rows[0].total);
  });

  it("associe un tarif à chaque annonce", async () => {
    const { rows } = await db.query(
      "select count(*)::int as total from listings where price_from is null",
    );
    expect(rows[0].total).toBe(0);
  });

  it("associe une politique d'annulation lisible à chaque annonce", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from listings l
      join cancellation_policies p on p.id = l.cancellation_policy_id
      where p.summary is null or length(p.summary) < 30
    `);
    expect(rows[0].total).toBe(0);
  });

  it("ouvre des dates réservables sur les six prochains mois", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from availabilities
      where status = 'open' and date > current_date
    `);
    expect(rows[0].total).toBeGreaterThan(500);
  });

  it("majore les tarifs du week-end", async () => {
    const { rows } = await db.query(`
      select
        max(a.price) filter (where extract(isodow from a.date) = 6) as samedi,
        max(a.price) filter (where extract(isodow from a.date) = 3) as mercredi
      from availabilities a
      join listings l on l.id = a.listing_id
      where l.slug = 'salle-etoile-haie-vive' and a.status = 'open'
    `);

    expect(Number(rows[0].samedi)).toBeGreaterThan(Number(rows[0].mercredi));
  });

  it("respecte le prix plancher de chaque annonce", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from availabilities a
      join listings l on l.id = a.listing_id
      where a.status = 'open' and l.min_price is not null and a.price < l.min_price
    `);
    expect(rows[0].total).toBe(0);
  });

  it("décrit les capacités de chaque lieu", async () => {
    const { rows } = await db.query(`
      select count(*)::int as total
      from listings l
      where l.kind = 'venue'
        and not exists (select 1 from venue_details v where v.listing_id = l.id)
    `);
    expect(rows[0].total).toBe(0);
  });

  it("peut être rejoué sans doublon", async () => {
    const before = await db.query("select count(*)::int as total from listings");
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/seed.sql", "utf8");
    await db.exec(sql);
    const after = await db.query("select count(*)::int as total from listings");

    expect(after.rows[0].total).toBe(before.rows[0].total);
  });
});
