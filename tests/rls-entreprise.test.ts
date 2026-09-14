import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Espace entreprise : ce qui distingue une société d'un particulier n'est pas
 * le volume, c'est que **la personne qui choisit n'est pas celle qui paie**.
 *
 * Trois garanties se vérifient ici et nulle part ailleurs : un organisateur ne
 * peut pas s'auto-valider, une entreprise ne voit pas les engagements d'une
 * autre, et l'aval accordé retient l'offre dans la même transaction.
 */

const DIANE = "d1a11e00-0000-4000-8000-00000000000d"; // organisatrice ACME
const PAUL = "9a017000-0000-4000-8000-00000000000e"; // valideur ACME
const RIVAL = "217a1000-0000-4000-8000-00000000000f"; // propriétaire d'une autre société
const ALICE = "a11ce000-0000-4000-8000-00000000000a"; // partenaire traiteur
const ADMIN = "ad000000-0000-4000-8000-00000000000b";

let db: TestDatabase;
let acme: string;
let other: string;
let orgAlice: string;
let costCenter: string;
let rivalCostCenter: string;
let request: string;
let item: string;
let quote: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${DIANE}', 'diane@acme.bj',  '{"account_type":"entreprise"}'),
      ('${PAUL}',  'paul@acme.bj',   '{"account_type":"entreprise"}'),
      ('${RIVAL}', 'rival@autre.bj', '{"account_type":"entreprise"}'),
      ('${ALICE}', 'alice@traiteur.bj', '{"account_type":"partenaire"}'),
      ('${ADMIN}', 'ops@enievent.bj', '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('company', 'ACME Bénin',      'acme-benin',   'active'),
      ('company', 'Autre Société',   'autre-societe','active'),
      ('partner', 'Saveurs du Bénin','saveurs',      'active')
    returning id, slug
  `);
  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  acme = bySlug["acme-benin"];
  other = bySlug["autre-societe"];
  orgAlice = bySlug["saveurs"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${acme}',    'company', '${DIANE}', 'organizer'),
      ('${acme}',    'company', '${PAUL}',  'approver'),
      ('${other}',   'company', '${RIVAL}', 'owner'),
      ('${orgAlice}','partner', '${ALICE}', 'owner');
  `);

  // Seuil bas pour qu'un engagement modeste le franchisse.
  await db.query(
    "insert into company_settings (org_id, approval_threshold) values ($1, 1000000)",
    [acme],
  );

  const centers = await db.query(`
    insert into cost_centers (org_id, code, name, budget_amount) values
      ('${acme}',  'MKT-2026', 'Marketing', 5000000),
      ('${other}', 'RH-2026',  'Ressources humaines', 3000000)
    returning id, code
  `);
  const byCode = Object.fromEntries(centers.rows.map((r) => [r.code as string, r.id as string]));
  costCenter = byCode["MKT-2026"];
  rivalCostCenter = byCode["RH-2026"];

  const { rows: cats } = await db.query(
    "select id from categories where slug = 'traiteur'",
  );
  const catTraiteur = cats[0].id as string;

  await db.exec(`
    insert into listings (org_id, category_id, kind, title, slug, city, status) values
      ('${orgAlice}', '${catTraiteur}', 'service', 'Buffet', 'buffet-acme', 'Cotonou', 'approved');
  `);

  // Le brief d'ACME, imputé sur le centre de coût marketing.
  request = (
    await actingAs(db, DIANE, async () =>
      db.query(
        `insert into quote_requests
           (requester_id, org_id, cost_center_id, title, city, budget_max)
         values ($1, $2, $3, 'Séminaire annuel', 'Cotonou', 4000000)
         returning id`,
        [DIANE, acme, costCenter],
      ),
    )
  ).rows[0].id as string;

  item = (
    await actingAs(db, DIANE, async () =>
      db.query(
        "insert into quote_request_items (request_id, category_id) values ($1, $2) returning id",
        [request, catTraiteur],
      ),
    )
  ).rows[0].id as string;

  await actingAs(db, DIANE, async () => {
    await db.query("update quote_requests set status = 'open' where id = $1", [request]);
  });

  // Une offre à 2 400 000, au-dessus du seuil de 1 000 000.
  quote = await actingAs(db, ALICE, async () => {
    const created = await db.query(
      "insert into quotes (item_id, org_id) values ($1, $2) returning id",
      [item, orgAlice],
    );
    const id = created.rows[0].id as string;

    await db.query(
      `insert into quote_lines (quote_id, label, quantity, unit, unit_price)
       values ($1, 'Traiteur séminaire', 1, 'forfait', 2400000)`,
      [id],
    );
    await db.query("update quotes set status = 'sent' where id = $1", [id]);

    return id;
  });
});

afterAll(async () => {
  await db?.close();
});

describe("imputation budgétaire", () => {
  it("refuse le centre de coût d'une autre entreprise", async () => {
    // La clé étrangère composite (id, org_id) rend l'état impossible, pas
    // seulement improbable.
    await actingAs(db, DIANE, async () => {
      await expect(
        db.query("update quote_requests set cost_center_id = $1 where id = $2", [
          rivalCostCenter,
          request,
        ]),
      ).rejects.toThrow();
    });
  });

  it("refuse un centre de coût sans entreprise", async () => {
    await actingAs(db, DIANE, async () => {
      await expect(
        db.query(
          `insert into quote_requests (requester_id, cost_center_id, title, city)
           values ($1, $2, 'Sans société', 'Cotonou')`,
          [DIANE, costCenter],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("seuil de validation", () => {
  it("refuse une acceptation directe au-dessus du seuil", async () => {
    await actingAs(db, DIANE, async () => {
      await expect(db.query("select accept_quote($1)", [quote])).rejects.toThrow(
        /seuil de validation/i,
      );
    });
  });

  it("laisse l'organisatrice demander l'aval", async () => {
    const result = await actingAs(db, DIANE, async () =>
      db.query("select request_quote_approval($1) as id", [quote]),
    );
    expect(result.rows[0].id).toBeTruthy();
  });

  it("n'ouvre pas deux demandes d'aval sur le même engagement", async () => {
    // Deux avals en cours donneraient deux décisions contradictoires.
    await actingAs(db, DIANE, async () => {
      await db.query("select request_quote_approval($1)", [quote]);
    });

    const { rows } = await db.query(
      "select count(*)::int as n from approvals where subject_id = $1 and status = 'pending'",
      [quote],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("qui décide", () => {
  it("refuse à l'organisatrice de valider son propre engagement", async () => {
    // C'est tout l'objet du circuit : celui qui choisit n'engage pas seul.
    await actingAs(db, DIANE, async () => {
      const { rows } = await db.query(
        "select id from approvals where subject_id = $1 and status = 'pending'",
        [quote],
      );

      await expect(
        db.query("select decide_approval($1, true, null)", [rows[0].id]),
      ).rejects.toThrow(/valideur/i);
    });
  });

  it("refuse à une autre entreprise de voir l'engagement", async () => {
    const { rows } = await actingAs(db, RIVAL, async () =>
      db.query("select id from approvals where org_id = $1", [acme]),
    );
    expect(rows).toHaveLength(0);
  });

  it("exige un motif pour refuser", async () => {
    const { rows } = await db.query(
      "select id from approvals where subject_id = $1 and status = 'pending'",
      [quote],
    );

    await actingAs(db, PAUL, async () => {
      await expect(
        db.query("select decide_approval($1, false, 'non')", [rows[0].id]),
      ).rejects.toThrow(/pourquoi/i);
    });
  });

  it("accorde l'aval et retient l'offre dans la même transaction", async () => {
    const { rows } = await db.query(
      "select id from approvals where subject_id = $1 and status = 'pending'",
      [quote],
    );

    await actingAs(db, PAUL, async () => {
      await db.query("select decide_approval($1, true, null)", [rows[0].id]);
    });

    const approval = await db.query("select status, decided_by from approvals where id = $1", [
      rows[0].id,
    ]);
    expect(approval.rows[0].status).toBe("approved");
    expect(approval.rows[0].decided_by).toBe(PAUL);

    // L'aval **est** l'acceptation : pas d'offre validée mais non retenue.
    const accepted = await db.query("select status from quotes where id = $1", [quote]);
    expect(accepted.rows[0].status).toBe("accepted");

    const awarded = await db.query(
      "select awarded_quote_id from quote_request_items where id = $1",
      [item],
    );
    expect(awarded.rows[0].awarded_quote_id).toBe(quote);
  });

  it("refuse de décider deux fois", async () => {
    const { rows } = await db.query(
      "select id from approvals where subject_id = $1",
      [quote],
    );

    await actingAs(db, PAUL, async () => {
      await expect(
        db.query("select decide_approval($1, true, null)", [rows[0].id]),
      ).rejects.toThrow(/déjà décidée/i);
    });
  });
});

describe("suivi budgétaire", () => {
  it("compte l'offre retenue comme engagée", async () => {
    const { rows } = await actingAs(db, DIANE, async () =>
      db.query("select committed, remaining from company_budget_usage where cost_center_id = $1", [
        costCenter,
      ]),
    );

    expect(Number(rows[0].committed)).toBe(2_400_000);
    expect(Number(rows[0].remaining)).toBe(2_600_000);
  });

  it("ne montre à une entreprise que ses propres enveloppes", async () => {
    const { rows } = await actingAs(db, RIVAL, async () =>
      db.query("select cost_center_id from company_budget_usage"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].cost_center_id).toBe(rivalCostCenter);
  });

  it("réserve les réglages de validation à la finance", async () => {
    // Une organisatrice ne relève pas son propre seuil.
    const result = await actingAs(db, DIANE, async () =>
      db.query("update company_settings set approval_threshold = 99999999 where org_id = $1", [
        acme,
      ]),
    );
    expect(result.affectedRows).toBe(0);
  });

  it("journalise la décision", async () => {
    const { rows } = await actingAs(db, ADMIN, async () =>
      db.query("select action, to_state from audit_logs where entity_id = $1 and action = 'approve'", [
        quote,
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].to_state).toBe("approved");
  });
});
