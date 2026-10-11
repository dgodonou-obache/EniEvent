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

  it("ouvre des dates sur les six prochains mois", async () => {
    // Les dates restent ouvertes même si rien n'est payable : elles font vivre
    // le calendrier des fiches et le filtre par dates de la recherche.
    const { rows } = await db.query(`
      select count(*)::int as total
      from availabilities
      where status = 'open' and date > current_date
    `);
    expect(rows[0].total).toBeGreaterThan(500);
  });

  /**
   * ⚠️ **Aucune annonce fictive n'est payable, et ce test est le seul gardien
   * de cette règle.**
   *
   * Sept annonces du jeu de démonstration portaient `instant` ou `both`, dont
   * trois avec des dates ouvertes à 120 000, 180 000 et 300 000 F — jusqu'à
   * 450 000 F le week-end. Ces lieux n'existent pas, et les six organisations
   * du seed n'ont aucun membre : personne n'aurait honoré la prestation ni même
   * vu la commande arriver. Rien dans le code ne s'y opposait, puisque du point
   * de vue de `book_listing` tout était en règle.
   *
   * Remettre `instant` dans le seed pour faire marcher un contrôle rouvrirait
   * la porte en silence. `smoke:annulation`, qui a besoin d'une annonce
   * réservable, s'en fabrique une lui-même et la remet sur devis en partant.
   */
  it("ne rend aucune annonce de démonstration payable", async () => {
    const { rows } = await db.query(`
      select l.slug, l.booking_mode
      from listings l
      where l.booking_mode in ('instant', 'both')
      order by l.slug
    `);

    expect(rows.map((r) => `${r.slug} (${r.booking_mode})`)).toEqual([]);
  });

  it("refuse une réservation immédiate sur une annonce du seed", async () => {
    // Le contrôle qui compte : pas « l'écran ne propose pas », mais « la base
    // refuse ». C'est `book_listing` qui tranche, quel que soit l'appelant.
    const { rows: cible } = await db.query(`
      select a.listing_id, a.date
      from availabilities a
      join listings l on l.id = a.listing_id
      where a.status = 'open' and a.date > current_date and l.status = 'approved'
      order by a.date
      limit 1
    `);

    const users = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'acheteur-seed@exemple.bj', '{"account_type":"particulier"}')
       returning id`,
    );

    await actingAs(db, users.rows[0].id as string, async () => {
      await expect(
        db.query("select id from book_listing($1, array[$2::date])", [
          cible[0].listing_id,
          cible[0].date,
        ]),
      ).rejects.toThrow(/se réserve sur devis/i);
    });
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
