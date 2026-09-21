import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * L'annuaire des partenaires.
 *
 * **Le contournement le plus direct de la plateforme** ne demandait aucune
 * compétence : `select phone from organizations` sans session rendait le numéro
 * de tous les prestataires. On relève, on appelle, on réserve en direct, et la
 * commission — seul revenu d'ÉniEvent — ne s'applique à rien.
 *
 * ⚠️ Ces tests portent sur des **droits de colonne**, pas sur la RLS. La
 * distinction change la façon de vérifier : une ligne masquée par la RLS ne
 * lève aucune erreur, elle disparaît du résultat ; une colonne interdite, elle,
 * lève bel et bien. Un test écrit sur le mauvais modèle passerait sans rien
 * prouver.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000a3"; // membre de l'organisation
const CURIEUX = "bbbbbbbb-0000-4000-8000-0000000000b3"; // connecté, mais étranger
const ADMIN = "ffffffff-0000-4000-8000-0000000000f3";

let db: TestDatabase;
let org: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',  'patron@annuaire.bj',  '{"account_type":"partenaire"}'),
      ('${CURIEUX}', 'curieux@exemple.bj',  '{"account_type":"particulier"}'),
      ('${ADMIN}',   'ops3@enievent.bj',    '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, city, phone, billing_email, rccm)
    values ('partner', 'Traiteur Discret', 'traiteur-discret', 'active', 'Cotonou',
            '+2290197000042', 'compta@discret.bj', 'RB/COT/25 A 1234')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );
});

afterAll(async () => {
  await db?.close?.();
});

describe("ce qui reste public", () => {
  it("laisse un visiteur lire le nom et la ville d'un partenaire", async () => {
    // C'est ce qui permet d'afficher « proposé par » sur une annonce : la
    // fermeture ne doit pas casser le catalogue.
    const rows = await actingAs(db, null, () =>
      db.query("select brand_name, legal_name, city, slug from organizations where id = $1", [org]),
    );

    expect(rows.rows[0].legal_name).toBe("Traiteur Discret");
    expect(rows.rows[0].city).toBe("Cotonou");
  });
});

describe("ce qui ne l'est plus", () => {
  const interdites = ["phone", "billing_email", "rccm", "ifu"];

  it("refuse le téléphone à un visiteur non connecté", async () => {
    for (const colonne of interdites) {
      await expect(
        actingAs(db, null, () => db.query(`select ${colonne} from organizations where id = $1`, [org])),
        colonne,
      ).rejects.toThrow();
    }
  });

  it("le refuse aussi à un compte connecté quelconque", async () => {
    // Le cas qui compte : créer un compte est gratuit et instantané. Ne fermer
    // qu'`anon` n'aurait protégé de rien.
    for (const colonne of interdites) {
      await expect(
        actingAs(db, CURIEUX, () =>
          db.query(`select ${colonne} from organizations where id = $1`, [org]),
        ),
        colonne,
      ).rejects.toThrow();
    }
  });

  it("le refuse même à un administrateur en lecture directe", async () => {
    // ⚠️ Un droit de colonne ne distingue pas l'administrateur : il est lui
    // aussi `authenticated`. C'est assumé — il passe par `org_contact`.
    await expect(
      actingAs(db, ADMIN, () => db.query("select phone from organizations where id = $1", [org])),
    ).rejects.toThrow();
  });

  it("ne laisse pas non plus passer un select étoilé", async () => {
    // La porte de service évidente : `select *` réclame toutes les colonnes,
    // donc aussi celles qui sont retirées.
    await expect(
      actingAs(db, CURIEUX, () => db.query("select * from organizations where id = $1", [org])),
    ).rejects.toThrow();
  });
});

describe("les lectures légitimes", () => {
  it("rend ses coordonnées à un membre de l'organisation", async () => {
    const rows = await actingAs(db, PATRON, () =>
      db.query("select * from org_contact($1)", [org]),
    );

    expect(rows.rows[0].phone).toBe("+2290197000042");
    expect(rows.rows[0].billing_email).toBe("compta@discret.bj");
  });

  it("les rend à l'administration", async () => {
    const rows = await actingAs(db, ADMIN, () => db.query("select * from org_contact($1)", [org]));
    expect(rows.rows[0].phone).toBe("+2290197000042");
  });

  it("ne rend rien à un tiers", async () => {
    // Ici la fonction filtre par ligne, pas par colonne : elle ne lève donc
    // pas, elle rend zéro ligne. C'est bien ce qu'il faut vérifier.
    const rows = await actingAs(db, CURIEUX, () =>
      db.query("select * from org_contact($1)", [org]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("ne rend rien à un visiteur non connecté", async () => {
    await expect(
      actingAs(db, null, () => db.query("select * from org_contact($1)", [org])),
    ).rejects.toThrow();
  });
});

describe("les notifications continuent de partir", () => {
  it("laisse app.org_email retrouver l'adresse malgré la fermeture", async () => {
    // La fonction est `SECURITY DEFINER` : elle ne subit pas les droits de
    // colonne. Sans cela, plus aucun partenaire ne serait prévenu d'une
    // demande — une panne muette, et la pire de toutes.
    const rows = await db.query("select app.org_email($1) as courriel", [org]);
    expect(rows.rows[0].courriel).toBe("compta@discret.bj");
  });
});
