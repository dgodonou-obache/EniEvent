import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actingAs,
  assertRlsApplies,
  createTestDatabase,
  type TestDatabase,
} from "../scripts/lib/harness.mjs";

/**
 * Vérifie que la RLS isole réellement les organisations.
 *
 * Ces tests sont la contrepartie du pari « toute la sécurité est en base » :
 * si une politique laisse fuiter les pièces KYC d'un partenaire vers un autre,
 * aucune revue de code côté application ne le rattrapera.
 */

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001"; // partenaire A
const BOB = "bbbbbbbb-0000-4000-8000-000000000002"; // partenaire B
const CLARA = "cccccccc-0000-4000-8000-000000000003"; // entreprise
const ADMIN = "dddddddd-0000-4000-8000-000000000004"; // ops ÉniEvent

let db: TestDatabase;

let orgA: string;
let orgB: string;
let orgCompany: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await assertRlsApplies(db);

  // Création des comptes : le déclencheur on_auth_user_created remplit profiles.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@traiteur.ci', '{"full_name":"Alice","account_type":"partenaire"}'),
      ('${BOB}',   'bob@deco.ci',      '{"full_name":"Bob","account_type":"partenaire"}'),
      ('${CLARA}', 'clara@acme.ci',    '{"full_name":"Clara","account_type":"entreprise"}'),
      ('${ADMIN}', 'ops@enievent.com', '{"full_name":"Ops"}');
  `);

  // Le statut d'administrateur ne s'obtient pas à l'inscription — le
  // déclencheur ignore un `account_type: "admin"` venu du client. Il se confère
  // depuis le back-office, ce que l'on reproduit ici.
  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, city) values
      ('partner', 'Traiteur Delice',  'traiteur-delice',  'active',  'Abidjan'),
      ('partner', 'Deco Prestige',    'deco-prestige',    'active',  'Abidjan'),
      ('company', 'ACME CI',          'acme-ci',          'active',  'Abidjan'),
      ('partner', 'Nouveau Partenaire','nouveau-partenaire','pending','Dakar')
    returning id, slug
  `);

  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgA = bySlug["traiteur-delice"];
  orgB = bySlug["deco-prestige"];
  orgCompany = bySlug["acme-ci"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgA}',       'partner', '${ALICE}', 'owner'),
      ('${orgB}',       'partner', '${BOB}',   'owner'),
      ('${orgCompany}', 'company', '${CLARA}', 'owner');
  `);

  await db.exec(`
    insert into kyc_documents (org_id, type, file_path) values
      ('${orgA}', 'rccm', 'kyc/a/rccm.pdf'),
      ('${orgB}', 'rccm', 'kyc/b/rccm.pdf');
  `);

  await db.exec(`
    insert into cost_centers (org_id, code, name, budget_amount) values
      ('${orgCompany}', 'MKT', 'Marketing', 5000000);
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("profils", () => {
  it("chacun ne voit que le sien", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select id from profiles")).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ALICE);
  });

  it("un administrateur les voit tous", async () => {
    const rows = await actingAs(db, ADMIN, async () =>
      (await db.query("select id from profiles")).rows,
    );
    expect(rows).toHaveLength(4);
  });
});

describe("cloisonnement entre partenaires", () => {
  it("un partenaire ne voit pas les pièces KYC d'un autre", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select org_id, file_path from kyc_documents")).rows,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].org_id).toBe(orgA);
  });

  it("un partenaire ne voit pas l'équipe d'un autre", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select org_id from organization_members")).rows,
    );

    expect(rows.every((row) => row.org_id === orgA)).toBe(true);
  });

  it("un partenaire ne peut pas valider son propre dossier KYC", async () => {
    // Attention au piège : une ligne masquée par la clause USING d'une politique
    // n'est pas « refusée », elle est invisible. L'UPDATE réussit donc en
    // touchant 0 ligne, sans lever d'erreur. Côté application, il faut vérifier
    // le nombre de lignes affectées — un `if (error)` seul conclurait à tort au
    // succès de l'opération.
    const result = await actingAs(db, ALICE, async () =>
      db.query("update kyc_documents set status = 'approved' where org_id = $1", [orgA]),
    );

    expect(result.rows).toHaveLength(0);

    const stillPending = await db.query(
      "select status from kyc_documents where org_id = $1",
      [orgA],
    );
    expect(stillPending.rows[0]?.status).toBe("pending");
  });

  it("un partenaire ne peut pas déposer une pièce KYC pour une autre organisation", async () => {
    // Ici en revanche la clause WITH CHECK lève bien une erreur : on ne peut pas
    // « ne pas voir » une ligne qu'on est en train de créer.
    await expect(
      actingAs(db, ALICE, async () =>
        db.query("insert into kyc_documents (org_id, type, file_path) values ($1, 'ifu', 'x.pdf')", [
          orgB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("un administrateur peut valider un dossier KYC", async () => {
    const rows = await actingAs(db, ADMIN, async () =>
      (
        await db.query(
          "update kyc_documents set status = 'approved' where org_id = $1 returning status",
          [orgA],
        )
      ).rows,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("approved");
  });
});

describe("cloisonnement des entreprises", () => {
  it("un partenaire ne voit pas les centres de coûts d'une entreprise", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      (await db.query("select id from cost_centers")).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("le membre de l'entreprise voit les siens", async () => {
    const rows = await actingAs(db, CLARA, async () =>
      (await db.query("select code from cost_centers")).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("MKT");
  });
});

describe("visibilité publique", () => {
  it("un visiteur voit les partenaires actifs mais pas ceux en attente", async () => {
    const rows = await actingAs(db, null, async () =>
      (await db.query("select slug, status from organizations")).rows,
    );

    const slugs = rows.map((row) => row.slug);
    expect(slugs).toContain("traiteur-delice");
    expect(slugs).not.toContain("nouveau-partenaire");
  });

  it("un visiteur ne voit aucune entreprise cliente", async () => {
    const rows = await actingAs(db, null, async () =>
      (await db.query("select slug from organizations")).rows,
    );
    expect(rows.map((row) => row.slug)).not.toContain("acme-ci");
  });
});

describe("intégrité des rôles", () => {
  it("refuse un rôle d'entreprise dans une organisation partenaire", async () => {
    await expect(
      db.exec(`
        insert into organization_members (org_id, org_type, user_id, role)
        values ('${orgA}', 'partner', '${CLARA}', 'approver');
      `),
    ).rejects.toThrow(/role_matches_org_type/);
  });

  it("corrige un org_type mensonger au lieu de le croire", async () => {
    // Le client annonce 'company' pour une organisation partenaire ; le
    // déclencheur réaligne, et la contrainte rejette alors le rôle incohérent.
    await expect(
      db.exec(`
        insert into organization_members (org_id, org_type, user_id, role)
        values ('${orgA}', 'company', '${CLARA}', 'viewer');
      `),
    ).rejects.toThrow(/role_matches_org_type/);
  });
});
