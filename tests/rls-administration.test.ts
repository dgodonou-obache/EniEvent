import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Le back-office d'exploitation (migration 0040).
 *
 * Trois colonnes **définissent un privilège** et se protègent donc par une
 * fonction dédiée, jamais par la seule RLS : `profiles.account_type`,
 * `organizations.status`, `feature_flags.enabled`. La migration 0021 avait
 * retiré les deux premières du `grant update` après trois élévations de
 * privilèges réelles ; ce lot ouvre enfin la porte prévue, et ces tests
 * vérifient qu'elle ne s'ouvre que pour l'administration.
 *
 * ⚠️ Le piège à ne pas oublier : **un UPDATE bloqué ne lève aucune erreur**.
 * Il touche zéro ligne. On ne teste donc pas « ça a échoué », on relit la
 * valeur.
 *
 * Deux garanties de plus, qui n'ont rien d'évident :
 *
 * - **un administrateur ne peut pas se retirer l'administration** — il ne
 *   pourrait plus revenir sur l'écran qui l'y remettrait ;
 * - **le dernier administrateur ne peut pas être rétrogradé** — plus personne
 *   au monde ne pourrait rouvrir le back-office.
 */

const ADMIN = "ffffffff-0000-4000-8000-0000000000c1";
const ADMIN_BIS = "ffffffff-0000-4000-8000-0000000000c2";
const PATRON = "aaaaaaaa-0000-4000-8000-0000000000c3";
const CLIENT = "bbbbbbbb-0000-4000-8000-0000000000c4";

let db: TestDatabase;
let orgPartenaire: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}',     'ops-c1@enievent.bj',  '{}'),
      ('${ADMIN_BIS}', 'ops-c2@enievent.bj',  '{}'),
      ('${PATRON}',    'patron-c@salle.bj',   '{"account_type":"partenaire"}'),
      ('${CLIENT}',    'client-c@exemple.bj', '{"account_type":"particulier"}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = any($1)", [
    [ADMIN, ADMIN_BIS],
  ]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Traiteur Test C', 'traiteur-test-c', 'active', '+2290197000031')
    returning id
  `);
  orgPartenaire = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [orgPartenaire]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [orgPartenaire, PATRON],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("type de compte", () => {
  it("laisse l'administration promouvoir quelqu'un", async () => {
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_account_type($1, 'partenaire')", [CLIENT]);
    });

    const { rows } = await db.query("select account_type from profiles where id = $1", [CLIENT]);
    expect(rows[0].account_type).toBe("partenaire");
  });

  it("refuse à un utilisateur ordinaire de se promouvoir", async () => {
    await expect(
      actingAs(db, CLIENT, async () => {
        await db.query("select set_account_type($1, 'admin')", [CLIENT]);
      }),
    ).rejects.toThrow(/administration/i);

    const { rows } = await db.query("select account_type from profiles where id = $1", [CLIENT]);
    expect(rows[0].account_type).not.toBe("admin");
  });

  /**
   * ⚠️ Le test qui compte le plus.
   *
   * La RLS `profiles_update_own` autorise chacun à modifier **sa propre
   * ligne**. Sans le retrait du droit de colonne (migration 0021), cet appel
   * réussirait et ouvrirait le back-office entier. Il ne doit ni lever, ni
   * écrire — c'est le cas silencieux du guide : zéro ligne touchée.
   */
  it("ne laisse pas écrire account_type directement, même sur sa propre ligne", async () => {
    await actingAs(db, CLIENT, async () => {
      await db
        .query("update profiles set account_type = 'admin' where id = $1", [CLIENT])
        .catch(() => undefined);
    });

    const { rows } = await db.query("select account_type from profiles where id = $1", [CLIENT]);
    expect(rows[0].account_type).not.toBe("admin");
  });

  it("refuse à un administrateur de se retirer l'administration", async () => {
    await expect(
      actingAs(db, ADMIN, async () => {
        await db.query("select set_account_type($1, 'particulier')", [ADMIN]);
      }),
    ).rejects.toThrow(/propre accès/i);
  });

  it("refuse de rétrograder le dernier administrateur", async () => {
    // On en retire un : il en reste exactement un.
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_account_type($1, 'particulier')", [ADMIN_BIS]);
    });

    await expect(
      actingAs(db, ADMIN_BIS, async () => {
        await db.query("select set_account_type($1, 'particulier')", [ADMIN]);
      }),
    ).rejects.toThrow(/administration/i);

    // Et l'administration restante est bien toujours là.
    const { rows } = await db.query(
      "select count(*)::int as n from profiles where account_type = 'admin'",
    );
    expect(rows[0].n).toBe(1);

    await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN_BIS]);
  });
});

describe("statut d'une organisation", () => {
  it("laisse l'administration suspendre un partenaire", async () => {
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_org_status($1, 'suspended')", [orgPartenaire]);
    });

    const { rows } = await db.query("select status from organizations where id = $1", [
      orgPartenaire,
    ]);
    expect(rows[0].status).toBe("suspended");

    await actingAs(db, ADMIN, async () => {
      await db.query("select set_org_status($1, 'active')", [orgPartenaire]);
    });
  });

  it("refuse au propriétaire de réactiver sa propre structure", async () => {
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_org_status($1, 'suspended')", [orgPartenaire]);
    });

    await expect(
      actingAs(db, PATRON, async () => {
        await db.query("select set_org_status($1, 'active')", [orgPartenaire]);
      }),
    ).rejects.toThrow(/administration/i);

    // Et l'écriture directe ne passe pas davantage : `organizations_update_by_admins`
    // laisse la **ligne**, mais 0021 a retiré `status` du droit de colonne.
    await actingAs(db, PATRON, async () => {
      await db
        .query("update organizations set status = 'active' where id = $1", [orgPartenaire])
        .catch(() => undefined);
    });

    const { rows } = await db.query("select status from organizations where id = $1", [
      orgPartenaire,
    ]);
    expect(rows[0].status).toBe("suspended");

    await actingAs(db, ADMIN, async () => {
      await db.query("select set_org_status($1, 'active')", [orgPartenaire]);
    });
  });
});

describe("interrupteurs", () => {
  it("est lisible par tous : le site doit savoir sans session", async () => {
    const { rows } = await db.query("select count(*)::int as n from feature_flags");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("refuse la bascule à qui n'est pas administrateur", async () => {
    await expect(
      actingAs(db, PATRON, async () => {
        await db.query("select set_feature_flag('messagerie', false)");
      }),
    ).rejects.toThrow(/administration/i);
  });

  it("refuse l'écriture directe de enabled, même à un administrateur", async () => {
    // Le droit de table n'existe pas : c'est la fonction ou rien. Un
    // administrateur est `authenticated` comme les autres.
    await actingAs(db, ADMIN, async () => {
      await db
        .query("update feature_flags set enabled = false where key = 'messagerie'")
        .catch(() => undefined);
    });

    const { rows } = await db.query("select enabled from feature_flags where key = 'messagerie'");
    expect(rows[0].enabled).toBe(true);
  });

  /**
   * ⚠️ **Un interrupteur qui ne commande rien est pire que pas
   * d'interrupteur.** C'est le test qui distingue un réglage d'un décor : on
   * coupe, puis on vérifie que la base **refuse réellement** l'écriture — pas
   * que l'écran cache un bouton.
   */
  it("coupe réellement la messagerie, par déclencheur", async () => {
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_feature_flag('messagerie', false)");
    });

    await expect(
      db.query(
        `insert into conversations (client_id, org_id) values ($1, $2)`,
        [CLIENT, orgPartenaire],
      ),
    ).rejects.toThrow(/indisponible/i);

    await actingAs(db, ADMIN, async () => {
      await db.query("select set_feature_flag('messagerie', true)");
    });

    // Et une fois rallumée, l'écriture repasse : la coupure n'a rien cassé.
    const { rows } = await db.query(
      `insert into conversations (client_id, org_id) values ($1, $2) returning id`,
      [CLIENT, orgPartenaire],
    );
    expect(rows[0].id).toBeTruthy();
  });

  it("ferme réellement les inscriptions partenaires, sans gêner l'administration", async () => {
    await actingAs(db, ADMIN, async () => {
      await db.query("select set_feature_flag('inscriptions_partenaires', false)");
    });

    await expect(
      db.query(`
        insert into organizations (type, legal_name, slug, status, phone)
        values ('partner', 'Refuse', 'refuse-c', 'pending', '+2290197000032')
      `),
    ).rejects.toThrow(/fermées/i);

    // Une entreprise, elle, n'est pas concernée : l'interrupteur nomme les
    // partenaires, il ne ferme pas l'inscription en général.
    const { rows } = await db.query(`
      insert into organizations (type, legal_name, slug, status, phone)
      values ('company', 'Entreprise C', 'entreprise-c', 'active', '+2290197000033')
      returning id
    `);
    expect(rows[0].id).toBeTruthy();

    await actingAs(db, ADMIN, async () => {
      await db.query("select set_feature_flag('inscriptions_partenaires', true)");
    });

    // Rallumé, le chemin repasse.
    const rouvert = await db.query(`
      insert into organizations (type, legal_name, slug, status, phone)
      values ('partner', 'Rouvert C', 'rouvert-c', 'active', '+2290197000034')
      returning id
    `);
    expect(rouvert.rows[0].id).toBeTruthy();
  });
});

describe("annuaire des comptes", () => {
  it("refuse admin_users à qui n'est pas administrateur", async () => {
    await expect(
      actingAs(db, PATRON, async () => {
        await db.query("select * from admin_users()");
      }),
    ).rejects.toThrow(/administration/i);
  });

  it("rend les adresses à l'administration, que profiles ne porte pas", async () => {
    await actingAs(db, ADMIN, async () => {
      const { rows } = await db.query("select * from admin_users()");

      expect(rows.length).toBeGreaterThan(0);

      const patron = rows.find((r) => (r as { id: string }).id === PATRON) as
        | { email: string }
        | undefined;
      expect(patron?.email).toBe("patron-c@salle.bj");
    });
  });

  it("filtre sur la recherche", async () => {
    await actingAs(db, ADMIN, async () => {
      const { rows } = await db.query("select * from admin_users($1)", ["patron-c"]);

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(PATRON);
    });
  });
});
