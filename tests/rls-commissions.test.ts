import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Commission par partenaire, et prix payé par le client.
 *
 * Deux garanties, et elles tiennent tout le modèle économique :
 *
 * - **la commission est une colonne de privilège** : un partenaire qui pourrait
 *   se la fixer à zéro travaillerait gratuitement pour la plateforme. La
 *   migration 0021 lui retire le droit d'écriture, la 0034 ouvre une porte
 *   réservée à l'administration — il faut vérifier que la porte ne s'ouvre pas
 *   pour les autres ;
 * - **le client paie le prix affiché**, sans supplément d'aucune sorte. Un
 *   frais qui reviendrait par une migration ultérieure se verrait ici.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000a2";
const CLIENTE = "bbbbbbbb-0000-4000-8000-0000000000b2";
const ADMIN = "ffffffff-0000-4000-8000-0000000000f2";

let db: TestDatabase;
let org: string;
let annonce: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',  'patron@salle.bj',    '{"account_type":"partenaire"}'),
      ('${CLIENTE}', 'cliente2@exemple.bj', '{"account_type":"particulier"}'),
      ('${ADMIN}',   'ops2@enievent.bj',    '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Etoile', 'salle-etoile-test', 'active', '+2290197000010')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );

  const cat = await db.query("select id from categories where kind = 'venue' order by slug limit 1");

  const fiches = await db.query(
    `insert into listings
       (org_id, category_id, kind, title, slug, city, status, booking_mode, currency, published_at)
     values ($1, $2, 'venue', 'Salle Etoile', 'salle-etoile-commission', 'Cotonou',
             'approved', 'instant', 'XOF', now())
     returning id`,
    [org, cat.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;
});

afterAll(async () => {
  await db?.close?.();
});

describe("qui peut fixer une commission", () => {
  it("laisse l'administration fixer un taux propre", async () => {
    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, 15)", [org]));

    const out = await db.query(
      "select commission_rate_override from partner_profiles where org_id = $1",
      [org],
    );
    expect(Number(out.rows[0].commission_rate_override)).toBe(15);
  });

  it("refuse au partenaire de fixer la sienne", async () => {
    // Le cas qui coûte : un partenaire à 0 % encaisse tout, et rien ne le
    // signale avant la comptabilité.
    await expect(
      actingAs(db, PATRON, () => db.query("select set_commission_rate($1, 0)", [org])),
    ).rejects.toThrow(/administration/);
  });

  it("refuse aussi l'écriture directe sur la colonne", async () => {
    // ⚠️ Un UPDATE bloqué par la RLS ne lève aucune erreur : il touche zéro
    // ligne. Ici c'est un **droit de colonne** qui protège, et lui lève bien.
    // On vérifie donc les deux : l'erreur, et la valeur restée intacte.
    await expect(
      actingAs(db, PATRON, () =>
        db.query("update partner_profiles set commission_rate_override = 0 where org_id = $1", [
          org,
        ]),
      ),
    ).rejects.toThrow();

    const out = await db.query(
      "select commission_rate_override from partner_profiles where org_id = $1",
      [org],
    );
    expect(Number(out.rows[0].commission_rate_override)).toBe(15);
  });

  it("refuse un taux hors de portée plutôt que d'inventer une marge", async () => {
    for (const taux of [-1, 101]) {
      await expect(
        actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, $2)", [org, taux])),
      ).rejects.toThrow(/entre 0 et 100/);
    }
  });

  it("distingue « au barème général » d'un taux de zéro", async () => {
    // Les confondre ferait travailler la plateforme gratuitement sur une
    // simple hésitation de saisie.
    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, 0)", [org]));
    let lu = await db.query("select app.commission_rate($1) as t", [org]);
    expect(Number(lu.rows[0].t)).toBe(0);

    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, null)", [org]));
    lu = await db.query("select app.commission_rate($1) as t", [org]);
    expect(Number(lu.rows[0].t)).toBe(10); // le barème général
  });

  it("réserve le barème général à l'administration", async () => {
    await expect(
      actingAs(db, PATRON, () => db.query("select set_default_commission_rate(2)")),
    ).rejects.toThrow(/administration/);

    await actingAs(db, ADMIN, () => db.query("select set_default_commission_rate(12.5)"));

    const lu = await db.query("select app.commission_rate($1) as t", [org]);
    expect(Number(lu.rows[0].t)).toBe(12.5);

    await actingAs(db, ADMIN, () => db.query("select set_default_commission_rate(10)"));
  });

  it("ne montre les barèmes qu'à l'administration", async () => {
    const vus = async (user: string) =>
      actingAs(db, user, async () => {
        const out = await db.query("select count(*)::int as n from commission_settings()");
        return out.rows[0].n as number;
      });

    expect(await vus(ADMIN)).toBeGreaterThan(0);
    // Un partenaire y lirait le taux de ses concurrents.
    expect(await vus(PATRON)).toBe(0);
    expect(await vus(CLIENTE)).toBe(0);
  });
});

describe("le client paie le prix affiché", () => {
  it("n'ajoute aucun frais au total de la commande", async () => {
    const jour = await db.query("select (current_date + 120)::date::text as d");
    const d = jour.rows[0].d as string;

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 250000, 1)`,
      [annonce, d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
      return out.rows[0];
    });

    // Le contrôle qui compte : 250 000 affichés, 250 000 dus. Pas 275 000.
    expect(Number(cmd.total)).toBe(250_000);
  });

  it("applique le taux du partenaire, figé sur la commande", async () => {
    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, 20)", [org]));

    const jour = await db.query("select (current_date + 121)::date::text as d");
    const d = jour.rows[0].d as string;

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 200000, 1)`,
      [annonce, d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
      return out.rows[0];
    });

    expect(Number(cmd.commission_rate)).toBe(20);

    // Changer le taux ensuite ne doit pas déplacer une commande déjà passée.
    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, 5)", [org]));

    const relu = await db.query("select commission_rate from orders where id = $1", [cmd.id]);
    expect(Number(relu.rows[0].commission_rate)).toBe(20);
  });

  it("prélève la commission sur la part du partenaire, jamais au-dessus du prix", async () => {
    await actingAs(db, ADMIN, () => db.query("select set_commission_rate($1, 10)", [org]));

    const jour = await db.query("select (current_date + 122)::date::text as d");
    const d = jour.rows[0].d as string;

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 200000, 1)`,
      [annonce, d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
      return out.rows[0];
    });

    const echeances = await db.query(
      "select id from order_instalments where order_id = $1 order by position",
      [cmd.id],
    );

    for (const e of echeances.rows as { id: string }[]) {
      const cle = `com-${e.id}`;
      await actingAs(db, CLIENTE, () => db.query("select start_payment($1, $2)", [e.id, cle]));
      await db.query("select settle_payment($1, $2, 'approved', true, null, null)", [
        cle,
        `tx-${cle}`,
      ]);
    }

    const totaux = await db.query(
      `select sum(amount)::bigint as encaisse,
              sum(commission)::bigint as com,
              sum(partner_due)::bigint as part
         from payments where order_id = $1`,
      [cmd.id],
    );

    // 200 000 affichés, 200 000 encaissés, 20 000 pour la plateforme, 180 000
    // pour le partenaire. Le client n'a rien payé de plus que le prix affiché.
    expect(Number(totaux.rows[0].encaisse)).toBe(200_000);
    expect(Number(totaux.rows[0].com)).toBe(20_000);
    expect(Number(totaux.rows[0].part)).toBe(180_000);
  });
});
