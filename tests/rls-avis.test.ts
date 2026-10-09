import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Avis, signalements, litiges — et la faille que ce lot a dû refermer d'abord.
 *
 * Tout ce qui est vérifié ici l'est **en se faisant passer pour quelqu'un**
 * (`actingAs`) : une requête lancée en superutilisateur contourne la RLS comme
 * les droits de colonne, et ne prouverait rien.
 */

const ALICE = "a11ce000-0000-4000-8000-0000000000a1"; // partenaire, Saveurs
const BOB = "b0b00000-0000-4000-8000-0000000000b1"; // partenaire concurrent
const CLARA = "c1a4a000-0000-4000-8000-0000000000c1"; // cliente
const ADMIN = "ad111000-0000-4000-8000-0000000000d1";

let db: TestDatabase;
let orgAlice: string;
let orgBob: string;
let annonceAlice: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@saveurs.bj', '{"account_type":"partenaire"}'),
      ('${BOB}',   'bob@deco.bj',      '{"account_type":"partenaire"}'),
      ('${CLARA}', 'clara@exemple.bj', '{"account_type":"particulier"}'),
      ('${ADMIN}', 'ops-avis@enievent.bj', '{}');
  `);

  // ⚠️ `app.handle_new_user` refuse un `account_type` « admin » demandé à
  // l'inscription (0006) : le rôle se pose ici, en superutilisateur.
  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('partner', 'Saveurs du Bénin', 'saveurs-avis', 'active'),
      ('partner', 'Deco Atlantique',  'deco-avis',    'active')
    returning id, slug
  `);
  const parSlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgAlice = parSlug["saveurs-avis"];
  orgBob = parSlug["deco-avis"];

  await db.exec(`
    insert into partner_profiles (org_id) values ('${orgAlice}'), ('${orgBob}')
      on conflict (org_id) do nothing;

    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgAlice}', 'partner', '${ALICE}', 'owner'),
      ('${orgBob}',   'partner', '${BOB}',   'owner');
  `);

  const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
  const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");

  const annonces = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status, cancellation_policy_id)
     values ($1, $2, 'service', 'Buffet béninois', 'buffet-avis', 'Cotonou', 'approved', $3)
     returning id`,
    [orgAlice, cats[0].id, baremes[0].id],
  );
  annonceAlice = annonces.rows[0].id as string;
});

afterAll(async () => {
  await db?.close();
});

/**
 * ⚠️ **La faille refermée par la migration 0047.**
 *
 * `0003_catalogue.sql:597` accordait `insert, update, delete` sur treize
 * tables d'un coup, dont `listings`. Combiné à `listings_update`, qui ouvre la
 * ligne entière au propriétaire, un partenaire écrivait sa propre note — et le
 * tri par défaut du catalogue est `rating_avg desc`.
 *
 * Ces trois contrôles **doivent repasser au rouge** si quelqu'un remet un
 * `grant update on listings` par commodité. Le premier tombe sur le droit de
 * colonne, les deux suivants sur le déclencheur de garde, qui existe
 * précisément pour ce jour-là.
 */
describe("notes non falsifiables", () => {
  it("refuse au partenaire d'écrire la note de son annonce", async () => {
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set rating_avg = 5, rating_count = 128 where id = $1", [
          annonceAlice,
        ]),
      ).rejects.toThrow(/permission denied|insufficient|ne s'écrivent pas/i);
    });
  });

  it("refuse aussi le prix d'appel, qui se déduit des tarifs", async () => {
    // `price_from` n'est pas qu'un critère de tri : c'est le prix **affiché au
    // client** sur la carte. Écrit à la main, il annonce une somme qui
    // n'existe dans aucune règle de tarification.
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set price_from = 1 where id = $1", [annonceAlice]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("refuse de reculer la date de publication", async () => {
    // Départage du tri par défaut : la reculer, c'est se déclarer plus récent
    // que tout le monde, définitivement.
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set published_at = now() + interval '1 year' where id = $1", [
          annonceAlice,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("laisse le partenaire modifier ce qui le regarde", async () => {
    // ⚠️ Le contre-test compte autant : une énumération positive trop serrée
    // est une panne, pas une protection. Ce sont exactement les colonnes
    // qu'écrit `updateListing`.
    const { affectedRows } = await actingAs(db, ALICE, async () =>
      db.query(
        `update listings set title = 'Buffet béninois premium', description = 'Six plats',
           city = 'Porto-Novo', district = 'Dowa', booking_mode = 'instant',
           payment_terms = '50 % à la commande', min_price = 400000,
           min_notice_days = 7, is_paused = true, cover_url = 'https://exemple.bj/a.jpg',
           seo_title = 'Buffet', seo_description = 'Traiteur à Cotonou'
         where id = $1`,
        [annonceAlice],
      ),
    );

    expect(affectedRows).toBe(1);

    await db.query("update listings set is_paused = false where id = $1", [annonceAlice]);
  });

  it("laisse le partenaire créer une annonce", async () => {
    // L'`insert` est énuméré lui aussi : sans cela, créer une annonce
    // échouerait sur une colonne absente du grant — et le message ne nommerait
    // que `permission denied for table listings`.
    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");

    const { rows } = await actingAs(db, ALICE, async () =>
      db.query(
        `insert into listings (org_id, category_id, kind, title, slug, city, district,
           booking_mode, cancellation_policy_id, status)
         values ($1, $2, 'service', 'Cocktail', 'cocktail-avis', 'Cotonou', 'Fidjrossè',
           'quote', $3, 'draft')
         returning id, rating_count`,
        [orgAlice, cats[0].id, baremes[0].id],
      ),
    );

    expect(rows[0].rating_count).toBe(0);
  });

  it("refuse de nommer la note à la création", async () => {
    // Le droit d'`insert` est énuméré : la colonne absente de la liste ne peut
    // pas être nommée du tout, elle prend sa valeur par défaut.
    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");

    await actingAs(db, ALICE, async () => {
      await expect(
        db.query(
          `insert into listings (org_id, category_id, kind, title, slug, city,
             cancellation_policy_id, rating_avg, rating_count)
           values ($1, $2, 'service', 'Triche', 'triche-avis', 'Cotonou', $3, 5, 99)`,
          [orgAlice, cats[0].id, baremes[0].id],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("refuse à un concurrent de dégrader la note d'autrui", async () => {
    // Bob est propriétaire de sa structure, pas de celle d'Alice : la RLS le
    // masque, donc l'`update` touche zéro ligne sans lever d'erreur. C'est le
    // cas silencieux du §3 du guide — seul le compte le révèle.
    const { affectedRows } = await actingAs(db, BOB, async () =>
      db.query("update listings set title = 'Sabotage' where id = $1", [annonceAlice]),
    );

    expect(affectedRows).toBe(0);
  });

  it("laisse l'administration corriger une note", async () => {
    // Un administrateur est lui aussi `authenticated` : un droit de colonne ne
    // sait pas l'en distinguer, et le déclencheur l'exempte explicitement —
    // même moule que `app.guard_privilege_columns` (0021). Sans cette porte,
    // aucune correction manuelle ne serait possible après un incident.
    const { rows } = await actingAs(db, ADMIN, async () =>
      db.query(
        "update listings set moderation_notes = 'Vérifié' where id = $1 returning moderation_notes",
        [annonceAlice],
      ),
    );

    expect(rows[0].moderation_notes).toBe("Vérifié");
  });
});
