import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Lot D, première tranche (migration 0042).
 *
 * Trois garanties qui n'ont rien d'évident :
 *
 * - **Un favori est privé, et l'agrégat impossible.** C'est ce qui empêche de
 *   fabriquer « 42 personnes ont aimé » : même en y pensant, on ne pourrait
 *   pas le calculer (guide §5).
 * - **Le jeton d'invitation n'est lisible par personne**, pas même par celui
 *   qui invite. Un droit de colonne ne distingue pas les lignes, et la RLS ne
 *   distingue pas les colonnes : ouvrir la lecture aurait laissé voir les
 *   jetons des invitations qu'on a le droit de voir.
 * - **Une invitation n'entre que chez son destinataire.** Un lien transféré —
 *   ou lu par-dessus une épaule — ne doit faire entrer personne d'autre.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000d1";
const EQUIPIER = "aaaaaaaa-0000-4000-8000-0000000000d2";
const CLIENT = "bbbbbbbb-0000-4000-8000-0000000000d3";
const AUTRE_CLIENT = "bbbbbbbb-0000-4000-8000-0000000000d4";
const INVITE = "cccccccc-0000-4000-8000-0000000000d5";
const ADMIN = "ffffffff-0000-4000-8000-0000000000d6";

let db: TestDatabase;
let org: string;
let annonce: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',       'patron-d@salle.bj',    '{"account_type":"partenaire"}'),
      ('${EQUIPIER}',     'equipier-d@salle.bj',  '{"account_type":"partenaire"}'),
      ('${CLIENT}',       'client-d@exemple.bj',  '{"account_type":"particulier"}'),
      ('${AUTRE_CLIENT}', 'autre-d@exemple.bj',   '{"account_type":"particulier"}'),
      ('${INVITE}',       'invite-d@exemple.bj',  '{"account_type":"particulier"}'),
      ('${ADMIN}',        'ops-d@enievent.bj',    '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Confort', 'salle-confort-d', 'active', '+2290197000041')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'staff')",
    [org, EQUIPIER],
  );

  const cat = await db.query("select id from categories where kind = 'venue' order by slug limit 1");

  const fiches = await db.query(
    `insert into listings (org_id, category_id, kind, slug, title, city, status, booking_mode)
     values ($1, $2, 'venue', 'salle-confort-d', 'Salle Confort', 'Cotonou', 'approved', 'instant')
     returning id`,
    [org, cat.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;
});

afterAll(async () => {
  await db?.close();
});

describe("favoris", () => {
  it("garde une annonce de côté, et la relit", async () => {
    await actingAs(db, CLIENT, async () => {
      await db.query("insert into favorites (user_id, listing_id) values ($1, $2)", [
        CLIENT,
        annonce,
      ]);

      const { rows } = await db.query("select listing_id from favorites");
      expect(rows).toHaveLength(1);
      expect(rows[0].listing_id).toBe(annonce);
    });
  });

  it("ne montre pas les favoris d'autrui", async () => {
    await actingAs(db, AUTRE_CLIENT, async () => {
      const { rows } = await db.query("select * from favorites");
      expect(rows).toHaveLength(0);
    });
  });

  it("refuse d'écrire un favori au nom de quelqu'un d'autre", async () => {
    await expect(
      actingAs(db, AUTRE_CLIENT, async () => {
        await db.query("insert into favorites (user_id, listing_id) values ($1, $2)", [
          CLIENT,
          annonce,
        ]);
      }),
    ).rejects.toThrow();
  });

  /**
   * ⚠️ Le test qui protège la règle §5.
   *
   * Compter les favoris d'une annonce est exactement ce qu'il ne faut pas
   * pouvoir faire : le chiffre dépend de qui passe, pas de ce que vaut la
   * prestation. La RLS ne rend que ses propres lignes, donc l'agrégat vaut au
   * mieux 1 — jamais le total. Personne ne peut fabriquer la preuve sociale,
   * même en écrivant la requête exprès.
   */
  it("rend l'agrégat public impossible", async () => {
    await actingAs(db, AUTRE_CLIENT, async () => {
      const { rows } = await db.query(
        "select count(*)::int as n from favorites where listing_id = $1",
        [annonce],
      );

      expect(rows[0].n).toBe(0);
    });

    // Même en superutilisateur le total existe — c'est la RLS qui protège,
    // et cette ligne le montre : sans elle, le test passerait aussi sur une
    // table vide, donc ne prouverait rien.
    const { rows } = await db.query("select count(*)::int as n from favorites");
    expect(rows[0].n).toBe(1);
  });
});

describe("demandes de support", () => {
  it("met le courriel en file à l'écriture, sans envoyer", async () => {
    await actingAs(db, PATRON, async () => {
      await db.query(
        `insert into support_requests (user_id, org_id, subject, body, reply_to)
         values ($1, $2, 'Je ne recois pas les demandes',
                 'Depuis trois jours, aucune demande ne me parvient par courriel.',
                 'patron-d@salle.bj')`,
        [PATRON, org],
      );
    });

    const { rows } = await db.query(
      "select recipient, kind, payload from notifications where kind = 'support.new'",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].recipient).toBe("contact@enievent.com");
    expect((rows[0].payload as { replyTo: string }).replyTo).toBe("patron-d@salle.bj");
  });

  it("ne montre pas la demande d'un autre utilisateur", async () => {
    await actingAs(db, CLIENT, async () => {
      const { rows } = await db.query("select * from support_requests");
      expect(rows).toHaveLength(0);
    });
  });

  it("laisse l'administration tout lire", async () => {
    await actingAs(db, ADMIN, async () => {
      const { rows } = await db.query("select * from support_requests");
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});

describe("invitations", () => {
  it("refuse à un équipier d'inviter", async () => {
    await expect(
      actingAs(db, EQUIPIER, async () => {
        await db.query("select invite_member($1, 'nouveau@exemple.bj', 'staff')", [org]);
      }),
    ).rejects.toThrow(/direction/i);
  });

  it("refuse un rôle qui n'existe pas dans ce type de structure", async () => {
    // « approver » est un rôle d'entreprise. La contrainte
    // `role_matches_org_type` ne se déclencherait qu'à l'acceptation, des
    // jours plus tard, chez quelqu'un d'autre.
    await expect(
      actingAs(db, PATRON, async () => {
        await db.query("select invite_member($1, 'nouveau@exemple.bj', 'approver')", [org]);
      }),
    ).rejects.toThrow(/n'existe pas dans ce type/i);
  });

  it("invite, et met le courriel en file avec son jeton", async () => {
    await actingAs(db, PATRON, async () => {
      await db.query("select invite_member($1, 'Invite-D@Exemple.bj', 'manager')", [org]);
    });

    const { rows } = await db.query(
      "select recipient, payload from notifications where kind = 'member.invited'",
    );

    expect(rows).toHaveLength(1);
    // L'adresse est normalisée en minuscules : personne ne retape son adresse
    // avec la même casse.
    expect(rows[0].recipient).toBe("invite-d@exemple.bj");
    expect(String((rows[0].payload as { token: string }).token)).toHaveLength(64);
  });

  /**
   * ⚠️ Le jeton **est** le secret, et il ne se lit pas.
   *
   * Pas même par celui qui invite : `revoke select (token)`. Un droit de
   * colonne ne distingue pas les lignes, donc lui ouvrir la lecture aurait
   * laissé voir les jetons de toutes les invitations de sa structure.
   */
  it("interdit la lecture du jeton, même au propriétaire", async () => {
    await expect(
      actingAs(db, PATRON, async () => {
        await db.query("select token from organization_invitations");
      }),
    ).rejects.toThrow();

    // Le reste de la ligne reste lisible : l'écran d'équipe en a besoin.
    await actingAs(db, PATRON, async () => {
      const { rows } = await db.query("select email, role from organization_invitations");
      expect(rows).toHaveLength(1);
    });
  });

  it("ne montre pas les invitations d'une autre structure", async () => {
    // ⚠️ Colonnes nommées, pas `select *` : l'étoile inclut `token`, qui n'est
    // accordé à personne — la requête échouerait sur un refus de droit avant
    // même que la RLS n'ait à filtrer, et le test ne prouverait plus rien sur
    // le cloisonnement.
    await actingAs(db, CLIENT, async () => {
      const { rows } = await db.query("select email, role from organization_invitations");
      expect(rows).toHaveLength(0);
    });
  });

  it("refuse d'entrer avec un compte dont l'adresse ne correspond pas", async () => {
    const { rows } = await db.query("select token from organization_invitations limit 1");
    const jeton = rows[0].token as string;

    await expect(
      actingAs(db, AUTRE_CLIENT, async () => {
        await db.query("select accept_invitation($1)", [jeton]);
      }),
    ).rejects.toThrow(/invite-d@exemple\.bj/i);
  });

  it("fait entrer le destinataire, avec le rôle prévu", async () => {
    const { rows } = await db.query("select token from organization_invitations limit 1");
    const jeton = rows[0].token as string;

    await actingAs(db, INVITE, async () => {
      await db.query("select accept_invitation($1)", [jeton]);
    });

    const membres = await db.query(
      "select role, status from organization_members where org_id = $1 and user_id = $2",
      [org, INVITE],
    );

    expect(membres.rows).toHaveLength(1);
    expect(membres.rows[0].role).toBe("manager");
    expect(membres.rows[0].status).toBe("active");
  });

  it("refuse de servir deux fois", async () => {
    const { rows } = await db.query("select token from organization_invitations limit 1");
    const jeton = rows[0].token as string;

    await expect(
      actingAs(db, INVITE, async () => {
        await db.query("select accept_invitation($1)", [jeton]);
      }),
    ).rejects.toThrow(/déjà été utilisée/i);
  });

  it("rend un aperçu sans jamais rendre le jeton", async () => {
    const { rows } = await db.query("select token from organization_invitations limit 1");
    const jeton = rows[0].token as string;

    // Accessible sans session : l'invité arrive souvent avant d'avoir un compte.
    await actingAs(db, null, async () => {
      const apercu = await db.query("select * from invitation_preview($1)", [jeton]);

      expect(apercu.rows[0].org_name).toBe("Salle Confort");
      expect(apercu.rows[0].role).toBe("manager");
      expect(Object.keys(apercu.rows[0])).not.toContain("token");
    });
  });

  it("périme un lien au-delà de son échéance", async () => {
    await actingAs(db, PATRON, async () => {
      await db.query("select invite_member($1, 'tardif-d@exemple.bj', 'staff')", [org]);
    });

    const { rows } = await db.query(
      "update organization_invitations set expires_at = now() - interval '1 day' " +
        "where email = 'tardif-d@exemple.bj' returning token",
    );

    await expect(
      actingAs(db, INVITE, async () => {
        await db.query("select accept_invitation($1)", [rows[0].token]);
      }),
    ).rejects.toThrow(/expiré/i);
  });
});
