import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Limitation de débit (migration 0045).
 *
 * ⚠️ **Un plafond trop serré est une panne, pas une protection.** Ces tests
 * éprouvent donc les deux bords : qu'il refuse l'abus, et qu'il **laisse
 * passer un usage normal**. Le second compte autant — un organisateur qui
 * prépare un mariage et se fait éconduire au troisième devis abandonne, et
 * personne ne saura jamais pourquoi.
 *
 * ⚠️ Le plafond vit dans un **déclencheur de table**, jamais en tête d'une
 * Server Action : `messages` a trois chemins d'écriture, et un plafond posé
 * sur deux d'entre eux ne plafonne rien (même leçon que les interrupteurs,
 * §2 du guide). Ces tests écrivent donc **directement en base**, par le chemin
 * que personne ne pense à protéger.
 */

const CLIENT = "aaaaaaaa-0000-4000-8000-0000000000e1";
const AUTRE_CLIENT = "aaaaaaaa-0000-4000-8000-0000000000e2";
const PATRON = "bbbbbbbb-0000-4000-8000-0000000000e3";
const ADMIN = "ffffffff-0000-4000-8000-0000000000e4";

let db: TestDatabase;
let org: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CLIENT}',       'client-e@exemple.bj', '{"account_type":"particulier"}'),
      ('${AUTRE_CLIENT}', 'autre-e@exemple.bj',  '{"account_type":"particulier"}'),
      ('${PATRON}',       'patron-e@salle.bj',   '{"account_type":"partenaire"}'),
      ('${ADMIN}',        'ops-e@enievent.bj',   '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Débit', 'salle-debit-e', 'active', '+2290197000051')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );
});

afterAll(async () => {
  await db?.close();
});

/** Dépose `combien` demandes d'affilée pour le compte de `qui`. */
async function deposer(qui: string, combien: number) {
  await actingAs(db, qui, async () => {
    for (let i = 0; i < combien; i += 1) {
      await db.query(
        `insert into quote_requests (requester_id, title, event_type, city, status)
         values ($1, $2, 'mariage', 'Cotonou', 'draft')`,
        [qui, `Brief ${i}`],
      );
    }
  });
}

describe("demandes de devis", () => {
  it("laisse passer un usage normal", async () => {
    // Quatre demandes dans l'heure : un client qui compare plusieurs formules.
    await expect(deposer(CLIENT, 4)).resolves.not.toThrow();
  });

  it("refuse la cinquième et le dit en clair", async () => {
    // ⚠️ Le message est lu par quelqu'un qui n'a peut-être rien fait de mal :
    // un formulaire renvoyé cinq fois parce que la page ramait. Il doit dire
    // quand revenir, pas « quota dépassé ».
    await expect(deposer(CLIENT, 2)).rejects.toThrow(/Réessayez dans une heure/);
  });

  it("compte par personne, pas globalement", async () => {
    // Le plafond d'un client ne doit pas fermer la porte à son voisin.
    await expect(deposer(AUTRE_CLIENT, 4)).resolves.not.toThrow();
  });
});

describe("messages", () => {
  /**
   * ⚠️ L'écriture directe sur `messages` est refusée à tout le monde depuis la
   * migration 0038 — le corps brut ne doit jamais être servi par PostgREST.
   * Le plafond s'éprouve donc par `send_message`, le seul chemin ouvert.
   *
   * Et il **s'applique quand même** : `send_message` est `security definer`,
   * mais `auth.uid()` lit la revendication du jeton, pas le rôle d'exécution.
   * Le déclencheur voit donc toujours la personne, jamais le propriétaire de
   * la fonction — c'est ce qui rend ce plafond impossible à contourner en
   * passant par une fonction privilégiée.
   */
  it("borne l'envoi en rafale, même à travers une fonction privilégiée", async () => {
    const fil = await actingAs(db, AUTRE_CLIENT, async () => {
      const { rows } = await db.query("select (public.open_conversation($1)).id as id", [org]);
      return rows[0].id as string;
    });

    await actingAs(db, AUTRE_CLIENT, async () => {
      for (let i = 0; i < 30; i += 1) {
        await db.query("select public.send_message($1, $2)", [fil, `message ${i}`]);
      }
    });

    await expect(
      actingAs(db, AUTRE_CLIENT, async () => {
        await db.query("select public.send_message($1, $2)", [fil, "un de trop"]);
      }),
    ).rejects.toThrow(/Réessayez dans une heure/);
  });
});

describe("qui échappe au plafond", () => {
  /**
   * ⚠️ La clé de service doit passer : seeds, `demo:reset`, tâches planifiées
   * et webhooks écrivent en rafale par construction. Un seed bridé par un
   * plafond conçu pour des humains échouerait au milieu, sans raison lisible.
   *
   * `auth.uid()` est nul dans ce cas — c'est ce que vérifie `app.hors_plafond`.
   */
  it("laisse passer la clé de service", async () => {
    // Hors `actingAs` : aucun utilisateur n'est posé, comme pour un seed.
    for (let i = 0; i < 25; i += 1) {
      await db.query(
        `insert into quote_requests (requester_id, title, event_type, city, status)
         values ($1, $2, 'mariage', 'Cotonou', 'draft')`,
        [CLIENT, `Seed ${i}`],
      );
    }

    const { rows } = await db.query(
      "select count(*)::int as n from quote_requests where requester_id = $1",
      [CLIENT],
    );
    expect(rows[0].n).toBeGreaterThan(20);
  });

  it("laisse passer l'administration", async () => {
    // Elle agit pour réparer, souvent en rafale — le moment précis où un
    // plafond nuirait.
    await expect(
      actingAs(db, ADMIN, async () => {
        for (let i = 0; i < 8; i += 1) {
          await db.query(
            `insert into quote_requests (requester_id, title, event_type, city, status)
             values ($1, $2, 'mariage', 'Cotonou', 'draft')`,
            [ADMIN, `Admin ${i}`],
          );
        }
      }),
    ).resolves.not.toThrow();
  });
});
