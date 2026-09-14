import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Photos : tout le cloisonnement repose sur **le premier dossier du chemin**.
 *
 * Un partenaire dépose sous `{son org}/{son annonce}/{fichier}`. Si cette règle
 * cède, n'importe qui peut remplacer les photos d'un concurrent — ou déposer
 * n'importe quoi sous son nom. Cela ne se teste ni au typecheck ni à l'œil :
 * il faut interroger la base en se faisant passer pour l'un puis pour l'autre.
 */

const ALICE = "a11ce000-0000-4000-8000-00000000000a";
const BOB = "b0b00000-0000-4000-8000-00000000000b";

let db: TestDatabase;
let orgAlice: string;
let orgBob: string;
let listingAlice: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@traiteur.bj', '{"account_type":"partenaire"}'),
      ('${BOB}',   'bob@deco.bj',       '{"account_type":"partenaire"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('partner', 'Saveurs du Bénin', 'saveurs', 'active'),
      ('partner', 'Deco Atlantique',  'deco',    'active')
    returning id, slug
  `);
  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgAlice = bySlug["saveurs"];
  orgBob = bySlug["deco"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgAlice}', 'partner', '${ALICE}', 'owner'),
      ('${orgBob}',   'partner', '${BOB}',   'owner');
  `);

  const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");

  const listings = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status)
     values ($1, $2, 'service', 'Buffet', 'buffet-photos', 'Cotonou', 'approved')
     returning id`,
    [orgAlice, cats[0].id],
  );
  listingAlice = listings.rows[0].id as string;
});

afterAll(async () => {
  await db?.close();
});

describe("découpage du chemin", () => {
  it("expose l'organisation en premier dossier", async () => {
    // C'est exactement ce que lisent les politiques de stockage.
    const { rows } = await db.query(
      "select (storage.foldername($1))[1] as org, (storage.foldername($1))[2] as listing",
      [`${orgAlice}/${listingAlice}/photo.jpg`],
    );

    expect(rows[0].org).toBe(orgAlice);
    expect(rows[0].listing).toBe(listingAlice);
  });
});

describe("écriture", () => {
  it("laisse un partenaire déposer sous son organisation", async () => {
    await actingAs(db, ALICE, async () => {
      const result = await db.query(
        "insert into storage.objects (bucket_id, name) values ('annonces', $1) returning id",
        [`${orgAlice}/${listingAlice}/photo-1.jpg`],
      );
      expect(result.rows).toHaveLength(1);
    });
  });

  it("refuse un dépôt sous l'organisation d'un concurrent", async () => {
    // Le cas qui compte : Bob vise le dossier d'Alice.
    await actingAs(db, BOB, async () => {
      await expect(
        db.query("insert into storage.objects (bucket_id, name) values ('annonces', $1)", [
          `${orgAlice}/${listingAlice}/intrus.jpg`,
        ]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("refuse un chemin sans dossier d'organisation", async () => {
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("insert into storage.objects (bucket_id, name) values ('annonces', $1)", [
          "photo-a-la-racine.jpg",
        ]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("refuse un premier dossier qui n'est pas un identifiant", async () => {
    // Comparaison en texte : un chemin forgé doit être refusé, pas provoquer
    // une erreur de conversion.
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("insert into storage.objects (bucket_id, name) values ('annonces', $1)", [
          "../../etc/passwd.jpg",
        ]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("refuse un visiteur non connecté", async () => {
    await actingAs(db, null, async () => {
      await expect(
        db.query("insert into storage.objects (bucket_id, name) values ('annonces', $1)", [
          `${orgAlice}/${listingAlice}/anonyme.jpg`,
        ]),
      ).rejects.toThrow();
    });
  });
});

describe("suppression", () => {
  it("refuse à un concurrent d'effacer une photo", async () => {
    // Une ligne masquée par une clause USING ne lève pas d'erreur : la
    // suppression réussit en touchant 0 ligne. Seul le compte le révèle.
    const result = await actingAs(db, BOB, async () =>
      db.query("delete from storage.objects where name = $1", [
        `${orgAlice}/${listingAlice}/photo-1.jpg`,
      ]),
    );

    expect(result.affectedRows).toBe(0);
  });

  it("laisse le propriétaire effacer la sienne", async () => {
    const result = await actingAs(db, ALICE, async () =>
      db.query("delete from storage.objects where name = $1", [
        `${orgAlice}/${listingAlice}/photo-1.jpg`,
      ]),
    );

    expect(result.affectedRows).toBe(1);
  });
});

describe("lecture", () => {
  it("laisse un visiteur non connecté voir les photos", async () => {
    // Le seau est public : une vignette d'annonce est vue avant toute
    // connexion, et une URL signée par image coûterait un aller-retour chacune.
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('annonces', $1)",
      [`${orgAlice}/${listingAlice}/publique.jpg`],
    );

    const { rows } = await actingAs(db, null, async () =>
      db.query("select name from storage.objects where bucket_id = 'annonces'"),
    );

    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("registre des médias", () => {
  it("refuse deux photos au même rang", async () => {
    await actingAs(db, ALICE, async () => {
      await db.query(
        "insert into listing_media (listing_id, storage_path, position) values ($1, $2, 0)",
        [listingAlice, `${orgAlice}/${listingAlice}/a.jpg`],
      );

      await expect(
        db.query(
          "insert into listing_media (listing_id, storage_path, position) values ($1, $2, 0)",
          [listingAlice, `${orgAlice}/${listingAlice}/b.jpg`],
        ),
      ).rejects.toThrow();
    });
  });

  it("refuse à un concurrent d'inscrire une photo sur l'annonce d'autrui", async () => {
    await actingAs(db, BOB, async () => {
      await expect(
        db.query(
          "insert into listing_media (listing_id, storage_path, position) values ($1, $2, 5)",
          [listingAlice, `${orgBob}/x/c.jpg`],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
