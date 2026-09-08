import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actingAs,
  createTestDatabase,
  type TestDatabase,
} from "../scripts/lib/harness.mjs";

/**
 * Catalogue : visibilité publique, cloisonnement entre partenaires, et les
 * garde-fous métier déplacés de l'application vers la base — modération,
 * prix plancher, cohérence lieu/service.
 */

const ALICE = "aaaaaaaa-0000-4000-8000-00000000000a"; // partenaire A (traiteur)
const BOB = "bbbbbbbb-0000-4000-8000-00000000000b"; // partenaire B (décoration)
const CLARA = "cccccccc-0000-4000-8000-00000000000c"; // entreprise cliente
const ADMIN = "dddddddd-0000-4000-8000-00000000000d";

let db: TestDatabase;
let orgA: string;
let orgB: string;
let orgCompany: string;
let catTraiteur: string;
let catSalle: string;
let listingApproved: string; // annonce publiée d'Alice
let listingDraft: string; // brouillon d'Alice

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@traiteur.ci', '{"account_type":"partenaire"}'),
      ('${BOB}',   'bob@deco.ci',      '{"account_type":"partenaire"}'),
      ('${CLARA}', 'clara@acme.ci',    '{"account_type":"entreprise"}'),
      ('${ADMIN}', 'ops@enievent.com', '{}');
  `);

  // Promotion explicite : un compte ne peut pas se déclarer administrateur à
  // l'inscription (cf. migration 0006).
  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('partner', 'Traiteur Delice', 'traiteur-delice', 'active'),
      ('partner', 'Deco Prestige',   'deco-prestige',   'active'),
      ('company', 'ACME CI',         'acme-ci',         'active')
    returning id, slug
  `);
  const orgBySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgA = orgBySlug["traiteur-delice"];
  orgB = orgBySlug["deco-prestige"];
  orgCompany = orgBySlug["acme-ci"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgA}',       'partner', '${ALICE}', 'owner'),
      ('${orgB}',       'partner', '${BOB}',   'owner'),
      ('${orgCompany}', 'company', '${CLARA}', 'owner');
  `);

  // On s'appuie sur le référentiel livré par la migration 0004 plutôt que d'en
  // recréer un : les tests portent ainsi sur les catégories réelles.
  const cats = await db.query(
    "select id, slug from categories where slug in ('traiteur', 'salle-de-reception')",
  );
  const catBySlug = Object.fromEntries(cats.rows.map((r) => [r.slug as string, r.id as string]));
  catTraiteur = catBySlug["traiteur"];
  catSalle = catBySlug["salle-de-reception"];

  // Les annonces naissent en brouillon : la validation est un acte d'administration.
  const listings = await db.query(`
    insert into listings (org_id, category_id, kind, title, slug, city, min_price) values
      ('${orgA}', '${catTraiteur}', 'service', 'Buffet Ivoirien 200 couverts', 'buffet-ivoirien', 'Abidjan', 500000),
      ('${orgA}', '${catTraiteur}', 'service', 'Cocktail dinatoire',           'cocktail-dinatoire', 'Abidjan', null)
    returning id, slug
  `);
  const listingBySlug = Object.fromEntries(
    listings.rows.map((r) => [r.slug as string, r.id as string]),
  );
  listingApproved = listingBySlug["buffet-ivoirien"];
  listingDraft = listingBySlug["cocktail-dinatoire"];

  await actingAs(db, ADMIN, async () => {
    await db.query("update listings set status = 'approved' where id = $1", [listingApproved]);
  });
});

afterAll(async () => {
  await db?.close();
});

describe("visibilité publique", () => {
  it("un visiteur ne voit que les annonces validées", async () => {
    const rows = await actingAs(db, null, async () =>
      (await db.query("select slug from listings")).rows,
    );

    expect(rows.map((r) => r.slug)).toEqual(["buffet-ivoirien"]);
  });

  it("la mise en pause retire l'annonce du catalogue public", async () => {
    await actingAs(db, ALICE, async () => {
      await db.query("update listings set is_paused = true where id = $1", [listingApproved]);
    });

    const visible = await actingAs(db, null, async () =>
      (await db.query("select slug from listings")).rows,
    );
    expect(visible).toHaveLength(0);

    // Le partenaire, lui, continue de la voir dans son back-office.
    const ownerView = await actingAs(db, ALICE, async () =>
      (await db.query("select slug from listings")).rows,
    );
    expect(ownerView).toHaveLength(2);

    await actingAs(db, ALICE, async () => {
      await db.query("update listings set is_paused = false where id = $1", [listingApproved]);
    });
  });

  it("un partenaire ne voit pas les brouillons d'un autre", async () => {
    const rows = await actingAs(db, BOB, async () =>
      (await db.query("select slug from listings")).rows,
    );

    expect(rows.map((r) => r.slug)).toEqual(["buffet-ivoirien"]);
  });
});

describe("modération", () => {
  it("un partenaire ne peut pas valider sa propre annonce", async () => {
    await expect(
      actingAs(db, ALICE, async () =>
        db.query("update listings set status = 'approved' where id = $1", [listingDraft]),
      ),
    ).rejects.toThrow(/administrateur/i);
  });

  it("un partenaire peut soumettre son annonce à validation", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (
        await db.query(
          "update listings set status = 'pending' where id = $1 returning status",
          [listingDraft],
        )
      ).rows,
    );

    expect(rows[0]?.status).toBe("pending");
  });

  it("la validation horodate la publication", async () => {
    const rows = await actingAs(db, ADMIN, async () =>
      (
        await db.query(
          "update listings set status = 'approved' where id = $1 returning published_at",
          [listingDraft],
        )
      ).rows,
    );

    expect(rows[0]?.published_at).not.toBeNull();
  });
});

describe("garde-fous métier", () => {
  it("refuse une annonce dont la nature contredit la catégorie", async () => {
    // « traiteur » est une catégorie de service : on ne peut pas la déclarer lieu.
    await expect(
      db.exec(`
        insert into listings (org_id, category_id, kind, title, slug, city)
        values ('${orgA}', '${catTraiteur}', 'venue', 'Incohérent', 'incoherent', 'Abidjan');
      `),
    ).rejects.toThrow(/listings_category_id_kind_fkey|foreign key/i);
  });

  it("refuse une annonce rattachée à une entreprise cliente", async () => {
    await expect(
      db.exec(`
        insert into listings (org_id, category_id, kind, title, slug, city)
        values ('${orgCompany}', '${catSalle}', 'venue', 'Salle ACME', 'salle-acme', 'Abidjan');
      `),
    ).rejects.toThrow(/foreign key|listings_org_id_org_type_fkey/i);
  });

  it("refuse un tarif inférieur au prix plancher", async () => {
    // Prix plancher : 500 000 FCFA. La faute de frappe classique retire un zéro.
    await expect(
      actingAs(db, ALICE, async () =>
        db.query(
          "insert into availabilities (listing_id, date, price) values ($1, '2026-12-24', 50000)",
          [listingApproved],
        ),
      ),
    ).rejects.toThrow(/prix plancher/i);
  });

  it("accepte un tarif au-dessus du prix plancher", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (
        await db.query(
          "insert into availabilities (listing_id, date, price) values ($1, '2026-12-25', 750000) returning price",
          [listingApproved],
        )
      ).rows,
    );

    expect(Number(rows[0]?.price)).toBe(750000);
  });

  it("interdit de vendre plus que l'inventaire", async () => {
    await expect(
      db.exec(`
        insert into availabilities (listing_id, date, inventory, capacity_used)
        values ('${listingApproved}', '2026-12-26', 1, 2);
      `),
    ).rejects.toThrow(/inventory_not_oversold/);
  });

  it("maintient « à partir de » depuis les règles de tarification", async () => {
    await actingAs(db, ALICE, async () => {
      await db.query(
        "insert into pricing_rules (listing_id, unit, base_price) values ($1, 'person', 12000), ($1, 'forfait', 900000)",
        [listingApproved],
      );
    });

    const result = await db.query("select price_from from listings where id = $1", [
      listingApproved,
    ]);

    // 12 000 FCFA par personne est le plus petit des deux tarifs : c'est le
    // « à partir de » qu'affichera le catalogue.
    expect(Number(result.rows[0]?.price_from)).toBe(12000);
  });
});

describe("vue de recherche", () => {
  it("ne laisse pas fuiter les brouillons", async () => {
    // Une vue s'exécute par défaut avec les droits de son propriétaire et
    // contournerait la RLS : `security_invoker = true` est ce qui l'en empêche.
    // Sans cette option, tout le catalogue non publié deviendrait lisible.
    const visible = await actingAs(db, null, async () =>
      (await db.query("select slug from listing_search")).rows,
    );

    const publik = await actingAs(db, null, async () =>
      (await db.query("select slug from listings")).rows,
    );

    expect(visible.map((r) => r.slug).sort()).toEqual(publik.map((r) => r.slug).sort());
  });

  it("montre au partenaire ses propres brouillons", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select slug from listing_search")).rows,
    );
    expect(rows.length).toBeGreaterThan(1);
  });

  it("aplatit catégorie, partenaire et capacité en colonnes directes", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (
        await db.query(
          "select category_slug, category_name, org_name, kind, max_capacity from listing_search where id = $1",
          [listingApproved],
        )
      ).rows,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category_slug: "traiteur",
      category_name: "Traiteur",
      org_name: "Traiteur Delice",
      kind: "service",
    });
  });

  it("remonte la capacité d'un lieu dans la même colonne qu'un service", async () => {
    // C'est tout l'intérêt de la vue : filtrer sur « 200 invités » sans savoir
    // si la capacité vient de venue_details ou de service_details.
    // Le lieu est créé ici même : dépendre d'un autre bloc de tests rendrait
    // celui-ci silencieusement inopérant selon l'ordre d'exécution.
    const created = await db.query(`
      insert into listings (org_id, category_id, kind, title, slug, city)
      values ('${orgA}', '${catSalle}', 'venue', 'Salle capacité', 'salle-capacite', 'Cotonou')
      returning id
    `);
    const venueId = created.rows[0].id as string;

    await db.exec(`
      insert into venue_details (listing_id, capacity_standing)
      values ('${venueId}', 240);
    `);

    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select max_capacity, kind from listing_search where id = $1", [venueId]))
        .rows,
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].max_capacity)).toBe(240);
    expect(rows[0].kind).toBe("venue");
  });

  it("expose les équipements sous forme de tableau filtrable", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select amenity_slugs from listing_search limit 1")).rows,
    );
    expect(Array.isArray(rows[0]?.amenity_slugs)).toBe(true);
  });
});

describe("tables filles", () => {
  it("les disponibilités d'un brouillon restent invisibles du public", async () => {
    await db.exec(`
      insert into listings (org_id, category_id, kind, title, slug, city)
      values ('${orgA}', '${catSalle}', 'venue', 'Salle secrète', 'salle-secrete', 'Abidjan');
    `);
    const secret = await db.query("select id from listings where slug = 'salle-secrete'");
    const secretId = secret.rows[0].id as string;

    await db.exec(`
      insert into availabilities (listing_id, date, price)
      values ('${secretId}', '2027-01-10', 200000);
    `);

    const publicRows = await actingAs(db, null, async () =>
      (await db.query("select id from availabilities where listing_id = $1", [secretId])).rows,
    );
    expect(publicRows).toHaveLength(0);

    const ownerRows = await actingAs(db, ALICE, async () =>
      (await db.query("select id from availabilities where listing_id = $1", [secretId])).rows,
    );
    expect(ownerRows).toHaveLength(1);
  });

  it("un partenaire ne peut pas modifier le planning d'un autre", async () => {
    const result = await actingAs(db, BOB, async () =>
      db.query("update availabilities set price = 1 where listing_id = $1", [listingApproved]),
    );

    // Rappel : la clause USING masque les lignes, elle ne lève pas d'erreur.
    expect(result.rows).toHaveLength(0);

    const untouched = await db.query(
      "select price from availabilities where listing_id = $1 and date = '2026-12-25'",
      [listingApproved],
    );
    expect(Number(untouched.rows[0]?.price)).toBe(750000);
  });
});
