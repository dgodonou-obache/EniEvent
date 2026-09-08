import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Appel d'offres : c'est le cloisonnement qui fait la valeur du produit.
 *
 * Trois garanties se vérifient ici et nulle part ailleurs — un partenaire ne
 * voit pas l'offre d'un concurrent, le client ne voit pas les brouillons, et
 * personne n'accepte un devis par un simple UPDATE.
 */

const ALICE = "aaaaaaaa-0000-4000-8000-00000000000a"; // traiteur, Cotonou
const BOB = "bbbbbbbb-0000-4000-8000-00000000000b"; // traiteur concurrent, Cotonou
const CARL = "cccccccc-0000-4000-8000-00000000000c"; // décorateur, Cotonou
const DIANE = "dddddddd-0000-4000-8000-00000000000d"; // cliente particulière
const ERIC = "eeeeeeee-0000-4000-8000-00000000000e"; // autre client, sans lien
const ADMIN = "ffffffff-0000-4000-8000-00000000000f";

let db: TestDatabase;
let orgAlice: string;
let orgBob: string;
let orgCarl: string;
let catTraiteur: string;
let catDeco: string;
let catSalle: string;
let request: string;
let itemTraiteur: string;
let itemDeco: string;
let quoteAlice: string;
let quoteBob: string;

/** Crée un devis brouillon avec une ligne, et rend son identifiant. */
async function draftQuote(user: string, org: string, item: string, price: number) {
  return actingAs(db, user, async () => {
    const created = await db.query(
      "insert into quotes (item_id, org_id, message) values ($1, $2, 'Proposition') returning id",
      [item, org],
    );
    const id = created.rows[0].id as string;

    await db.query(
      `insert into quote_lines (quote_id, label, quantity, unit, unit_price)
       values ($1, 'Prestation complète', 1, 'forfait', $2)`,
      [id, price],
    );

    return id;
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@traiteur.bj', '{"account_type":"partenaire"}'),
      ('${BOB}',   'bob@traiteur.bj',   '{"account_type":"partenaire"}'),
      ('${CARL}',  'carl@deco.bj',      '{"account_type":"partenaire"}'),
      ('${DIANE}', 'diane@exemple.bj',  '{"account_type":"particulier"}'),
      ('${ERIC}',  'eric@exemple.bj',   '{"account_type":"particulier"}'),
      ('${ADMIN}', 'ops@enievent.bj',   '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('partner', 'Saveurs du Bénin', 'saveurs-benin', 'active'),
      ('partner', 'Table Royale',     'table-royale',  'active'),
      ('partner', 'Deco Atlantique',  'deco-atlantique','active')
    returning id, slug
  `);
  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgAlice = bySlug["saveurs-benin"];
  orgBob = bySlug["table-royale"];
  orgCarl = bySlug["deco-atlantique"];

  await db.exec(`
    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgAlice}', 'partner', '${ALICE}', 'owner'),
      ('${orgBob}',   'partner', '${BOB}',   'owner'),
      ('${orgCarl}',  'partner', '${CARL}',  'owner');
  `);

  const cats = await db.query(
    "select id, slug from categories where slug in ('traiteur', 'decoration', 'salle-de-reception')",
  );
  const catBySlug = Object.fromEntries(cats.rows.map((r) => [r.slug as string, r.id as string]));
  catTraiteur = catBySlug["traiteur"];
  catDeco = catBySlug["decoration"];
  catSalle = catBySlug["salle-de-reception"];

  await db.exec(`
    insert into listings (org_id, category_id, kind, title, slug, city, status) values
      ('${orgAlice}', '${catTraiteur}', 'service', 'Buffet béninois',  'buffet-beninois',  'Cotonou', 'approved'),
      ('${orgBob}',   '${catTraiteur}', 'service', 'Menu gastronomique','menu-gastro',     'Cotonou', 'approved'),
      ('${orgCarl}',  '${catDeco}',     'service', 'Scénographie',     'scenographie',     'Cotonou', 'approved');
  `);

  // Le brief de Diane : un traiteur et un décorateur pour un mariage à Cotonou.
  request = (
    await actingAs(db, DIANE, async () =>
      db.query(
        `insert into quote_requests (requester_id, title, event_type, event_date, city, guests, budget_max)
         values ($1, 'Mariage à Cotonou', 'mariage', current_date + 90, 'Cotonou', 200, 5000000)
         returning id`,
        [DIANE],
      ),
    )
  ).rows[0].id as string;

  const items = await actingAs(db, DIANE, async () =>
    db.query(
      `insert into quote_request_items (request_id, category_id) values ($1, $2), ($1, $3)
       returning id, category_id`,
      [request, catTraiteur, catDeco],
    ),
  );
  itemTraiteur = items.rows.find((r) => r.category_id === catTraiteur)!.id as string;
  itemDeco = items.rows.find((r) => r.category_id === catDeco)!.id as string;

  await actingAs(db, DIANE, async () => {
    await db.query("update quote_requests set status = 'open' where id = $1", [request]);
  });
});

afterAll(async () => {
  await db?.close();
});

describe("publication du brief", () => {
  it("attribue une référence lisible", async () => {
    const rows = await db.query("select reference from quote_requests where id = $1", [request]);
    expect(rows.rows[0].reference).toMatch(/^DEM-\d{6}-\d{6}$/);
  });

  it("pose une date limite de réponse à la publication", async () => {
    // La promesse faite au client doit vivre dans la donnée, pas seulement
    // dans la page d'accueil.
    const rows = await db.query(
      "select respond_by, published_at from quote_requests where id = $1",
      [request],
    );
    expect(rows.rows[0].respond_by).not.toBeNull();
    expect(rows.rows[0].published_at).not.toBeNull();
  });

  it("refuse une transition interdite", async () => {
    await actingAs(db, DIANE, async () => {
      await expect(
        db.query("update quote_requests set status = 'draft' where id = $1", [request]),
      ).rejects.toThrow(/interdite/);
    });
  });
});

describe("qui voit le brief", () => {
  it("le traiteur voit le besoin de traiteur", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      db.query("select id from quote_request_items where id = $1", [itemTraiteur]),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("le traiteur ne voit pas le besoin de décoration", async () => {
    // Chacun ne voit que ce sur quoi il est crédible : inonder un traiteur de
    // demandes de fleurs le ferait décrocher.
    const rows = await actingAs(db, ALICE, async () =>
      db.query("select id from quote_request_items where id = $1", [itemDeco]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("un partenaire sans annonce dans la ville ni la catégorie ne voit rien", async () => {
    const salle = await db.query(
      `insert into listings (org_id, category_id, kind, title, slug, city, status)
       values ($1, $2, 'venue', 'Salle Parakou', 'salle-parakou', 'Parakou', 'approved')
       returning org_id`,
      [orgBob, catSalle],
    );
    expect(salle.rows).toHaveLength(1);

    // Une salle à Parakou ne concerne pas un mariage à Cotonou : un lieu ne se
    // déplace pas, contrairement à un service.
    const rows = await actingAs(db, CARL, async () =>
      db.query("select id from quote_request_items where id = $1", [itemTraiteur]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("un client tiers ne voit pas le brief d'un autre", async () => {
    const rows = await actingAs(db, ERIC, async () =>
      db.query("select id from quote_requests where id = $1", [request]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("la demanderesse voit sa demande", async () => {
    const rows = await actingAs(db, DIANE, async () =>
      db.query("select id from quote_requests where id = $1", [request]),
    );
    expect(rows.rows).toHaveLength(1);
  });
});

describe("offres scellées", () => {
  beforeAll(async () => {
    quoteAlice = await draftQuote(ALICE, orgAlice, itemTraiteur, 1_800_000);
    quoteBob = await draftQuote(BOB, orgBob, itemTraiteur, 2_400_000);
  });

  it("calcule le total depuis les lignes", async () => {
    // L'application ne fournit jamais le total : il est recalculé en base à
    // chaque mouvement de ligne.
    const rows = await db.query("select subtotal from quotes where id = $1", [quoteAlice]);
    expect(Number(rows.rows[0].subtotal)).toBe(1_800_000);
  });

  it("un partenaire ne voit pas le devis d'un concurrent", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      db.query("select id from quotes where id = $1", [quoteBob]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("un partenaire ne voit pas les lignes d'un concurrent", async () => {
    const rows = await actingAs(db, ALICE, async () =>
      db.query("select id from quote_lines where quote_id = $1", [quoteBob]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("la cliente ne voit pas les brouillons", async () => {
    const rows = await actingAs(db, DIANE, async () =>
      db.query("select id from quotes where item_id = $1", [itemTraiteur]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("refuse l'envoi d'un devis sans montant", async () => {
    const vide = await actingAs(db, CARL, async () => {
      const created = await db.query(
        "insert into quotes (item_id, org_id) values ($1, $2) returning id",
        [itemDeco, orgCarl],
      );
      return created.rows[0].id as string;
    });

    await actingAs(db, CARL, async () => {
      await expect(
        db.query("update quotes set status = 'sent' where id = $1", [vide]),
      ).rejects.toThrow(/sans montant/);
    });
  });

  it("la cliente voit les devis une fois envoyés", async () => {
    await actingAs(db, ALICE, async () => {
      await db.query("update quotes set status = 'sent' where id = $1", [quoteAlice]);
    });
    await actingAs(db, BOB, async () => {
      await db.query("update quotes set status = 'sent' where id = $1", [quoteBob]);
    });

    const rows = await actingAs(db, DIANE, async () =>
      db.query("select id, subtotal from quotes where item_id = $1 order by subtotal", [
        itemTraiteur,
      ]),
    );

    expect(rows.rows).toHaveLength(2);
    expect(Number(rows.rows[0].subtotal)).toBe(1_800_000);
  });

  it("fige les lignes une fois le devis envoyé", async () => {
    // Le client compare des montants : ils doivent rester ceux qu'on lui a
    // proposés. La ligne devient invisible en écriture, l'UPDATE touche 0 ligne.
    const result = await actingAs(db, ALICE, async () =>
      db.query("update quote_lines set unit_price = 1 where quote_id = $1", [quoteAlice]),
    );
    expect(result.affectedRows).toBe(0);

    const rows = await db.query("select subtotal from quotes where id = $1", [quoteAlice]);
    expect(Number(rows.rows[0].subtotal)).toBe(1_800_000);
  });

  it("un concurrent ne peut pas modifier le devis d'un autre", async () => {
    const result = await actingAs(db, BOB, async () =>
      db.query("update quotes set message = 'détourné' where id = $1", [quoteAlice]),
    );
    expect(result.affectedRows).toBe(0);
  });
});

describe("acceptation", () => {
  it("refuse une acceptation par simple UPDATE", async () => {
    await actingAs(db, DIANE, async () => {
      await expect(
        db.query("update quotes set status = 'accepted' where id = $1", [quoteAlice]),
      ).rejects.toThrow(/accept_quote/);
    });
  });

  it("refuse l'acceptation par quelqu'un d'autre que le demandeur", async () => {
    await actingAs(db, ERIC, async () => {
      await expect(db.query("select accept_quote($1)", [quoteAlice])).rejects.toThrow(
        /Seul le demandeur/,
      );
    });
  });

  it("accepte, refuse les rivaux et attribue le besoin", async () => {
    await actingAs(db, DIANE, async () => {
      await db.query("select accept_quote($1)", [quoteAlice]);
    });

    const retenu = await db.query("select status, decided_at from quotes where id = $1", [
      quoteAlice,
    ]);
    expect(retenu.rows[0].status).toBe("accepted");
    expect(retenu.rows[0].decided_at).not.toBeNull();

    const rival = await db.query(
      "select status, decline_reason from quotes where id = $1",
      [quoteBob],
    );
    expect(rival.rows[0].status).toBe("declined");
    expect(rival.rows[0].decline_reason).toContain("autre proposition");

    const item = await db.query(
      "select awarded_quote_id from quote_request_items where id = $1",
      [itemTraiteur],
    );
    expect(item.rows[0].awarded_quote_id).toBe(quoteAlice);
  });

  it("laisse la demande ouverte tant qu'un besoin n'est pas attribué", async () => {
    // La décoration n'a pas encore de devis retenu.
    const rows = await db.query("select status from quote_requests where id = $1", [request]);
    expect(rows.rows[0].status).toBe("open");
  });

  it("journalise l'acceptation", async () => {
    const rows = await actingAs(db, ADMIN, async () =>
      db.query(
        "select actor_id, action, to_state from audit_logs where entity_id = $1 and action = 'accept'",
        [quoteAlice],
      ),
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].actor_id).toBe(DIANE);
    expect(rows.rows[0].to_state).toBe("accepted");
  });

  it("réserve le journal d'audit à l'administration", async () => {
    const rows = await actingAs(db, DIANE, async () =>
      db.query("select id from audit_logs where entity_id = $1", [quoteAlice]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("refuse une seconde acceptation sur le même besoin", async () => {
    await actingAs(db, DIANE, async () => {
      await expect(db.query("select accept_quote($1)", [quoteBob])).rejects.toThrow(
        /devis envoyé/,
      );
    });
  });
});
