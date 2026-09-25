import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Supprimer son compte (migration 0043).
 *
 * Du code qui détruit des données : il se teste avant d'être appliqué, et
 * chaque garantie compte.
 *
 * - **On ne supprime que le sien.** La fonction ne prend aucun paramètre.
 * - **Ce qui appartient à l'autre partie survit.** Le piège est là : la chaîne
 *   `profiles → quote_requests → quote_request_items → quotes` est en cascade.
 *   Supprimer un client effaçait donc les devis que ses partenaires avaient
 *   chiffrés — le travail de quelqu'un d'autre.
 * - **On ne part pas en laissant de l'argent ou une prestation en suspens.**
 * - **Un compte supprimé ne revient pas**, même avec une session encore valide.
 */

const CLIENT_NET = "bbbbbbbb-0000-4000-8000-0000000000e1";
const CLIENT_HISTOIRE = "bbbbbbbb-0000-4000-8000-0000000000e2";
const CLIENT_ENCOURS = "bbbbbbbb-0000-4000-8000-0000000000e3";
const PATRON = "aaaaaaaa-0000-4000-8000-0000000000e4";
const PATRON_NEUF = "aaaaaaaa-0000-4000-8000-0000000000e5";

let db: TestDatabase;
let org: string;
let orgNeuve: string;
let annonce: string;

/** Les raisons de blocage rendues à l'utilisateur courant. */
async function blocages(): Promise<string[]> {
  const { rows } = await db.query("select code from account_deletion_blockers()");
  return rows.map((r) => r.code as string);
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CLIENT_NET}',      'net-e@exemple.bj',      '{"account_type":"particulier"}'),
      ('${CLIENT_HISTOIRE}', 'histoire-e@exemple.bj', '{"account_type":"particulier"}'),
      ('${CLIENT_ENCOURS}',  'encours-e@exemple.bj',  '{"account_type":"particulier"}'),
      ('${PATRON}',          'patron-e@salle.bj',     '{"account_type":"partenaire"}'),
      ('${PATRON_NEUF}',     'neuf-e@salle.bj',       '{"account_type":"partenaire"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Depart', 'salle-depart-e', 'active', '+2290197000051')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );

  // Une structure créée puis jamais utilisée : l'inscription faite par erreur.
  const neuves = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Structure Neuve', 'structure-neuve-e', 'pending', '+2290197000052')
    returning id
  `);
  orgNeuve = neuves.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [orgNeuve]);
  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [orgNeuve, PATRON_NEUF],
  );

  const cat = await db.query("select id from categories where kind = 'venue' order by slug limit 1");

  const fiches = await db.query(
    `insert into listings (org_id, category_id, kind, slug, title, city, status, booking_mode)
     values ($1, $2, 'venue', 'salle-depart-e', 'Salle Depart', 'Cotonou', 'approved', 'instant')
     returning id`,
    [org, cat.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;
});

afterAll(async () => {
  await db?.close();
});

describe("ce qui empêche de partir", () => {
  it("ne bloque pas un compte sans aucune activité", async () => {
    await actingAs(db, CLIENT_NET, async () => {
      expect(await blocages()).toEqual([]);
    });
  });

  it("bloque tant qu'une réservation n'est pas honorée", async () => {
    const dans30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    const demandes = await db.query(
      `insert into quote_requests (requester_id, reference, title, city, event_date, status)
       values ($1, 'DEM-E-1', 'Mariage', 'Cotonou', $2, 'closed') returning id`,
      [CLIENT_ENCOURS, dans30],
    );
    const items = await db.query(
      `insert into quote_request_items (request_id, category_id)
       select $1, category_id from listings where id = $2 returning id`,
      [demandes.rows[0].id, annonce],
    );
    const devis = await db.query(
      `insert into quotes (item_id, org_id, listing_id, reference, status, subtotal)
       values ($1, $2, $3, 'DEV-E-1', 'accepted', 500000) returning id`,
      [items.rows[0].id, org, annonce],
    );

    await db.query(
      // ⚠️ Ni `deposit_percent` ni `deposit_amount` : la migration 0028 les a
      // retirés en passant aux échéanciers. Les colonnes d'une commande se
      // relisent, elles ne se devinent pas.
      `insert into orders (quote_id, request_id, client_id, org_id, total,
                           commission_rate, status, event_date)
       values ($1, $2, $3, $4, 500000, 10, 'deposit_paid', $5)`,
      [devis.rows[0].id, demandes.rows[0].id, CLIENT_ENCOURS, org, dans30],
    );

    await actingAs(db, CLIENT_ENCOURS, async () => {
      expect(await blocages()).toContain("commandes_client");
    });

    // Et le partenaire ne peut pas s'éclipser non plus : c'est lui qui doit
    // assurer la prestation.
    await actingAs(db, PATRON, async () => {
      expect(await blocages()).toContain("commandes_partenaire");
    });
  });

  it("refuse de supprimer tant qu'un blocage tient, en le disant", async () => {
    await expect(
      actingAs(db, CLIENT_ENCOURS, async () => {
        await db.query("select delete_my_account()");
      }),
    ).rejects.toThrow(/réservation/i);

    // Et le compte est toujours là, entier.
    const { rows } = await db.query("select deleted_at from profiles where id = $1", [
      CLIENT_ENCOURS,
    ]);
    expect(rows[0].deleted_at).toBeNull();
  });

  it("bloque tant qu'une demande de devis est ouverte", async () => {
    await db.query(
      `insert into quote_requests (requester_id, reference, title, city, status)
       values ($1, 'DEM-E-2', 'Anniversaire', 'Cotonou', 'open')`,
      [CLIENT_NET],
    );

    await actingAs(db, CLIENT_NET, async () => {
      expect(await blocages()).toContain("demandes_ouvertes");
    });

    await db.query("update quote_requests set status = 'closed' where reference = 'DEM-E-2'");
  });

  /**
   * ⚠️ Le blocage le moins intuitif, et le plus important.
   *
   * Sans lui, quelqu'un part et plus personne ne sait à qui envoyer l'argent.
   */
  it("bloque tant qu'un remboursement est dû", async () => {
    const { rows } = await db.query(
      `select o.id, o.total, o.org_id from orders o where o.client_id = $1 limit 1`,
      [CLIENT_ENCOURS],
    );

    await db.query(
      `insert into refunds (order_id, client_id, org_id, amount, refund_percent, status, reason)
       values ($1, $2, $3, $4, 100, 'pending', 'Annulation du client')`,
      [rows[0].id, CLIENT_ENCOURS, rows[0].org_id, rows[0].total],
    );

    await actingAs(db, CLIENT_ENCOURS, async () => {
      expect(await blocages()).toContain("remboursement_du");
    });
  });

  it("bloque le dernier dirigeant d'une structure qui a vécu", async () => {
    await actingAs(db, PATRON, async () => {
      expect(await blocages()).toContain("dernier_dirigeant");
    });
  });

  it("laisse partir le fondateur d'une structure sans aucune activité", async () => {
    // L'inscription faite par erreur : la retenir à vie n'aurait aucun sens.
    await actingAs(db, PATRON_NEUF, async () => {
      expect(await blocages()).toEqual([]);
    });
  });
});

describe("effacement réel, quand rien ne dépend du compte", () => {
  it("emporte le compte et sa structure inactive", async () => {
    await actingAs(db, PATRON_NEUF, async () => {
      const { rows } = await db.query("select delete_my_account() as regime");
      expect(rows[0].regime).toBe("efface");
    });

    const users = await db.query("select id from auth.users where id = $1", [PATRON_NEUF]);
    expect(users.rows).toHaveLength(0);

    const profils = await db.query("select id from profiles where id = $1", [PATRON_NEUF]);
    expect(profils.rows).toHaveLength(0);

    const structures = await db.query("select id from organizations where id = $1", [orgNeuve]);
    expect(structures.rows).toHaveLength(0);
  });
});

describe("anonymisation, quand une histoire existe", () => {
  let devisDuPartenaire: string;

  beforeAll(async () => {
    // Un client qui a reçu un devis : le travail du partenaire.
    const demandes = await db.query(
      `insert into quote_requests (requester_id, reference, title, city, status)
       values ($1, 'DEM-E-3', 'Bapteme', 'Cotonou', 'closed') returning id`,
      [CLIENT_HISTOIRE],
    );
    const items = await db.query(
      `insert into quote_request_items (request_id, category_id)
       select $1, category_id from listings where id = $2 returning id`,
      [demandes.rows[0].id, annonce],
    );
    const devis = await db.query(
      `insert into quotes (item_id, org_id, listing_id, reference, status, subtotal)
       values ($1, $2, $3, 'DEV-E-3', 'declined', 300000) returning id`,
      [items.rows[0].id, org, annonce],
    );
    devisDuPartenaire = devis.rows[0].id as string;
  });

  it("efface l'identité et rend « anonymise »", async () => {
    await actingAs(db, CLIENT_HISTOIRE, async () => {
      const { rows } = await db.query("select delete_my_account() as regime");
      expect(rows[0].regime).toBe("anonymise");
    });

    const { rows } = await db.query(
      "select full_name, phone, deleted_at from profiles where id = $1",
      [CLIENT_HISTOIRE],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBeNull();
    expect(rows[0].phone).toBeNull();
    expect(rows[0].deleted_at).not.toBeNull();
  });

  /**
   * ⚠️ La garantie qui a motivé toute la conception.
   *
   * La chaîne `profiles → quote_requests → quote_request_items → quotes` est
   * en cascade : un effacement réel aurait emporté le devis du partenaire,
   * c'est-à-dire son travail et son historique commercial.
   */
  it("laisse intact le devis chiffré par le partenaire", async () => {
    const { rows } = await db.query("select id, subtotal from quotes where id = $1", [
      devisDuPartenaire,
    ]);

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].subtotal)).toBe(300000);
  });

  it("libère l'adresse, par une valeur non routable", async () => {
    const { rows } = await db.query("select email, banned_until from auth.users where id = $1", [
      CLIENT_HISTOIRE,
    ]);

    expect(rows[0].email).toBe(`supprime-${CLIENT_HISTOIRE}@enievent.invalid`);
    // `.invalid` est réservé par la norme : aucun courriel ne partira jamais là.
    expect(String(rows[0].email)).toMatch(/@enievent\.invalid$/);
    expect(rows[0].banned_until).not.toBeNull();
  });

  /**
   * ⚠️ Une date lointaine, jamais `'infinity'`.
   *
   * Avec l'infini, l'API d'administration de Supabase cesse de rendre le
   * compte : il disparaît de `listUsers` et du tableau de bord, alors que la
   * ligne est bien en base. Constaté en recette contre le vrai projet — un
   * écart qu'on ne découvre qu'en cherchant un compte au support, le jour où
   * ça presse. PGlite ne reproduit pas ce comportement : ce test garde donc la
   * **valeur**, seul indice qui subsiste ici.
   */
  it("bannit jusqu'à une date finie, pas jusqu'à l'infini", async () => {
    const { rows } = await db.query(
      `select banned_until = 'infinity'::timestamptz as infini,
              banned_until > now() as dans_le_futur
       from auth.users where id = $1`,
      [CLIENT_HISTOIRE],
    );

    expect(rows[0].infini).toBe(false);
    expect(rows[0].dans_le_futur).toBe(true);
  });

  it("refuse toute écriture depuis une session encore valide", async () => {
    // `banned_until` ferme la porte côté Supabase Auth ; ce contrôle vérifie la
    // seconde serrure, pour un jeton émis avant la suppression.
    await expect(
      actingAs(db, CLIENT_HISTOIRE, async () => {
        await db.query(
          `insert into quote_requests (requester_id, reference, title, city)
           values ($1, 'DEM-E-4', 'Retour', 'Cotonou')`,
          [CLIENT_HISTOIRE],
        );
      }),
    ).rejects.toThrow(/supprimé/i);
  });
});

describe("on ne supprime que le sien", () => {
  it("n'accepte aucun identifiant en argument", async () => {
    // Un paramètre aurait été une porte à garder. La fonction n'en a pas :
    // appeler avec un argument est une erreur de signature, pas un refus
    // d'autorisation — c'est plus fort.
    await expect(
      actingAs(db, CLIENT_NET, async () => {
        await db.query("select delete_my_account($1)", [PATRON]);
      }),
    ).rejects.toThrow();

    const { rows } = await db.query("select id from profiles where id = $1", [PATRON]);
    expect(rows).toHaveLength(1);
  });

  it("refuse à un visiteur non connecté", async () => {
    // Deux serrures, et c'est la première qui répond : le `revoke execute …
    // from anon` fait échouer l'appel avant même que la fonction ne s'exécute.
    // On n'exige donc pas le message métier, qui ne sert qu'au cas où le droit
    // serait un jour rouvert par mégarde.
    await expect(
      actingAs(db, null, async () => {
        await db.query("select delete_my_account()");
      }),
    ).rejects.toThrow(/permission denied|connectez-vous/i);
  });
});
