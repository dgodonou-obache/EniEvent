import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * File de notifications.
 *
 * Deux choses s'y jouent, qu'aucun test simulé ne peut trancher :
 *
 * 1. **Le remplissage.** Le déclencheur doit apparier les bons partenaires au
 *    passage de la demande à `open` — et seulement là. Une demande en brouillon
 *    qui alerterait tout Cotonou serait une catastrophe commerciale.
 * 2. **Le secret.** La file dit qui a été prévenu, donc qui sont les
 *    concurrents en lice. Un partenaire qui la lirait saurait contre combien il
 *    se bat : c'est précisément ce que le pli cacheté interdit.
 */

const CLIENT = "c11e0000-0000-4000-8000-00000000000c";
const TRAITEUR = "7a000000-0000-4000-8000-00000000000a";
const ADMIN = "ad000000-0000-4000-8000-00000000000d";

let db: TestDatabase;
let orgTraiteur: string;
let orgDecor: string;
let requestId: string;
let categoryTraiteur: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CLIENT}',   'client@exemple.bj',  '{"account_type":"particulier"}'),
      ('${TRAITEUR}', 'chef@saveurs.bj',    '{"account_type":"partenaire"}'),
      ('${ADMIN}',    'admin@enievent.bj',  '{"account_type":"admin"}');
  `);

  await db.exec(`update profiles set account_type = 'admin' where id = '${ADMIN}'`);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, city, phone) values
      ('partner', 'Saveurs du Benin', 'saveurs', 'active', 'Cotonou', '+2290197000001'),
      ('partner', 'Decor Ahossi',     'decor',   'active', 'Cotonou', '+2290197000002')
    returning id, slug
  `);
  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgTraiteur = bySlug["saveurs"];
  orgDecor = bySlug["decor"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgTraiteur}', 'partner', '${TRAITEUR}', 'owner');
  `);

  const { rows: cats } = await db.query(
    "select id, slug from categories where slug in ('traiteur', 'decoration')",
  );
  const byCat = Object.fromEntries(cats.map((r) => [r.slug as string, r.id as string]));
  categoryTraiteur = byCat["traiteur"];

  // Une annonce approuvée par catégorie : seul le traiteur doit être apparié.
  await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status) values
       ($1, $2, 'service', 'Buffet beninois', 'buffet-notif',  'Cotonou', 'approved'),
       ($3, $4, 'service', 'Decoration',      'decor-notif',   'Cotonou', 'approved')`,
    [orgTraiteur, categoryTraiteur, orgDecor, byCat["decoration"]],
  );

  const requests = await db.query(
    `insert into quote_requests (requester_id, title, event_type, city, description)
     values ($1, 'Mariage a Cotonou', 'mariage', 'Cotonou', 'Un buffet pour 150 personnes.')
     returning id`,
    [CLIENT],
  );
  requestId = requests.rows[0].id as string;

  await db.query(
    `insert into quote_request_items (request_id, category_id) values ($1, $2)`,
    [requestId, categoryTraiteur],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("remplissage de la file", () => {
  it("ne prévient personne tant que la demande est en brouillon", async () => {
    // Le déclencheur s'accroche à la transition, pas à l'insertion : une
    // demande encore rédigée ne doit alerter personne.
    const { rows } = await db.query("select count(*)::int as n from notifications");
    expect(rows[0].n).toBe(0);
  });

  it("met en file les partenaires concernés à la publication", async () => {
    await db.query("update quote_requests set status = 'open' where id = $1", [requestId]);

    const { rows } = await db.query(
      "select recipient, kind, status, target_org_id from notifications order by recipient",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].recipient).toBe("+2290197000001");
    expect(rows[0].kind).toBe("quote_request.new");
    expect(rows[0].status).toBe("pending");
    expect(rows[0].target_org_id).toBe(orgTraiteur);
  });

  it("épargne les partenaires d'une autre catégorie", async () => {
    // Le décorateur n'est pas concerné par un besoin de traiteur : le prévenir
    // serait payer pour agacer.
    const { rows } = await db.query(
      "select count(*)::int as n from notifications where target_org_id = $1",
      [orgDecor],
    );
    expect(rows[0].n).toBe(0);
  });

  it("ne prévient pas deux fois pour la même demande", async () => {
    // Une demande refermée puis rouverte ne doit pas relancer la facture.
    await db.query("update quote_requests set status = 'closed' where id = $1", [requestId]);
    await db.query("update quote_requests set status = 'open' where id = $1", [requestId]);

    const { rows } = await db.query("select count(*)::int as n from notifications");
    expect(rows[0].n).toBe(1);
  });

  it("porte de quoi rédiger le message sans relire la demande", async () => {
    const { rows } = await db.query("select payload from notifications limit 1");
    expect(rows[0].payload).toMatchObject({ city: "Cotonou" });
  });
});

describe("secret de la file", () => {
  it("reste invisible au partenaire prévenu lui-même", async () => {
    // Il reçoit le SMS, mais ne doit pas savoir combien d'autres l'ont reçu.
    const rows = await actingAs(db, TRAITEUR, () => db.query("select * from notifications"));
    expect(rows.rows).toHaveLength(0);
  });

  it("reste invisible au client qui a déposé la demande", async () => {
    const rows = await actingAs(db, CLIENT, () => db.query("select * from notifications"));
    expect(rows.rows).toHaveLength(0);
  });

  it("est lisible par l'administration", async () => {
    const rows = await actingAs(db, ADMIN, () => db.query("select * from notifications"));
    expect(rows.rows).toHaveLength(1);
  });

  it("ne se laisse pas marquer comme envoyée par un partenaire", async () => {
    // Sans ce retrait de droits, un partenaire pourrait éteindre les alertes
    // de ses concurrents en les déclarant déjà parties.
    await expect(
      actingAs(db, TRAITEUR, () =>
        db.query("select public.mark_notification($1, true, null)", [requestId]),
      ),
    ).rejects.toThrow();
  });
});
