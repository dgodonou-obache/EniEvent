import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Un règlement encaissé prévient les deux parties — migration 0053.
 *
 * ⚠️ **Le courriel qui n'existait pas.** Au premier paiement réel abouti, le
 * 21 octobre 2026, ni le client ni le partenaire n'ont rien reçu. Ce n'était
 * pas une panne d'envoi — la file était verte, les courriels du tunnel de devis
 * partaient — mais un **événement absent** : `payments` n'avait aucun
 * déclencheur, et `KINDS` aucun type de paiement. Tout notifiait sauf le moment
 * où l'argent arrive, c'est-à-dire le seul que les deux parties attendent.
 *
 * Et `/paiement/retour` promettait déjà l'inverse au client, mot pour mot :
 * « Votre prestataire en est informé. Vous recevrez un récapitulatif par
 * e-mail. »
 *
 * Trois garanties sont gardées ici, et la deuxième est celle qui se serait
 * cassée en silence.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000c1";
const CLIENTE = "bbbbbbbb-0000-4000-8000-0000000000c1";

let db: TestDatabase;
let org: string;
let annonce: string;

async function echeancesDe(commande: string) {
  const out = await db.query(
    "select id, position, label, amount::bigint as amount from order_instalments where order_id = $1 order by position",
    [commande],
  );
  return out.rows as { id: string; position: number; label: string; amount: string }[];
}

/** Règle une échéance de bout en bout, comme le fait le webhook. */
async function regler(echeance: string, cle: string, encaisse = true) {
  await actingAs(db, CLIENTE, () => db.query("select start_payment($1, $2)", [echeance, cle]));
  await db.query("select settle_payment($1, $2, $3, $4, null, null)", [
    cle,
    `tx-${cle}`,
    encaisse ? "approved" : "canceled",
    encaisse,
  ]);
}

async function fileDe(kind: string) {
  const out = await db.query(
    "select recipient, ref_id, payload from notifications where kind = $1 order by recipient",
    [kind],
  );
  return out.rows as { recipient: string; ref_id: string; payload: Record<string, unknown> }[];
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',  'patron@salle-notif.bj',  '{"account_type":"partenaire"}'),
      ('${CLIENTE}', 'cliente@notif.bj',       '{"account_type":"particulier"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Notif', 'salle-notif', 'active', '+2290197000030')
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
     values ($1, $2, 'venue', 'Salle Notif', 'salle-notif-fiche', 'Cotonou',
             'approved', 'instant', 'XOF', now())
     returning id`,
    [org, cat.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;
});

afterAll(async () => {
  await db?.close?.();
});

describe("un règlement encaissé prévient les deux parties", () => {
  let commande: string;
  let echeances: { id: string; position: number; label: string; amount: string }[];

  beforeAll(async () => {
    const jour = await db.query("select (current_date + 90)::date::text as d");
    const d = jour.rows[0].d as string;

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 1000000, 1)`,
      [annonce, d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
      return out.rows[0] as { id: string };
    });

    commande = cmd.id;
    echeances = await echeancesDe(commande);
    expect(echeances.length).toBeGreaterThan(1);
  });

  it("écrit une ligne pour le client et une pour le partenaire", async () => {
    await regler(echeances[0].id, "notif-acompte");

    const file = await fileDe("payment.received");

    expect(file.map((l) => l.recipient)).toEqual(["cliente@notif.bj", "patron@salle-notif.bj"]);
    expect(file.map((l) => l.payload.pour)).toEqual(["client", "partner"]);
  });

  it("dit ce qui reste dû, l'échéance réglée déduite", async () => {
    // Le déclencheur est `after` : la ligne qu'on vient de régler est déjà
    // comptée. Sans cela, le message annoncerait un reste trop grand — et un
    // client qui lit « il reste 1 000 000 » après avoir payé 300 000 appelle.
    const [client] = await fileDe("payment.received");
    const acompte = Number(echeances[0].amount);

    expect(client.payload.amount).toBe(acompte);
    expect(client.payload.remaining).toBe(1_000_000 - acompte);
    expect(client.payload.total).toBe(1_000_000);
  });

  it("ne prévient qu'une fois, même si le paiement est redénoué", async () => {
    // Le webhook et la tâche de rattrapage peuvent dénouer le même paiement :
    // c'est arrivé deux fois sur chacune des tentatives du 20 octobre.
    await db.query("select settle_payment($1, $2, 'approved', true, null, null)", [
      "notif-acompte",
      "tx-notif-acompte",
    ]);

    expect(await fileDe("payment.received")).toHaveLength(2);
  });

  /**
   * ⚠️ **Le piège qui se serait cassé en silence.**
   *
   * `notifications` est unique sur `(kind, ref_id, recipient)`. Avec
   * l'identifiant de la **commande** comme référence — le choix naturel, et le
   * mauvais — le solde d'un échéancier n'aurait jamais été annoncé : le
   * `on conflict do nothing` l'aurait avalé sans erreur, sans trace, et
   * personne n'aurait su qu'un second courriel manquait.
   */
  it("annonce aussi le solde, et non le seul premier versement", async () => {
    await regler(echeances[1].id, "notif-solde");

    const file = await fileDe("payment.received");

    expect(file).toHaveLength(4);
    expect(new Set(file.map((l) => l.ref_id)).size).toBe(2);

    const soldes = file.filter((l) => l.payload.remaining === 0);
    expect(soldes).toHaveLength(2);
  });

  it("porte de quoi rédiger sans relire la commande", async () => {
    const [client] = await fileDe("payment.received");

    expect(client.payload).toMatchObject({
      partner: "Salle Notif",
      listing: "Salle Notif",
      currency: "XOF",
    });
    expect(client.payload.reference).toMatch(/^CMD-/);
    expect(client.payload.paymentReference).toMatch(/^PAY-/);
  });
});

describe("ce qui ne doit rien déclencher", () => {
  it("ne prévient personne quand le règlement échoue", async () => {
    const jour = await db.query("select (current_date + 91)::date::text as d");
    const d = jour.rows[0].d as string;

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 500000, 1)`,
      [annonce, d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
      return out.rows[0] as { id: string };
    });

    const avant = (await fileDe("payment.received")).length;
    const [premiere] = await echeancesDe(cmd.id);

    await regler(premiere.id, "notif-echec", false);

    expect(await fileDe("payment.received")).toHaveLength(avant);
  });

  it("garde la file secrète, règlement compris", async () => {
    // Un partenaire qui lirait la file saurait ce que les autres encaissent.
    const vue = await actingAs(db, PATRON, () =>
      db.query("select * from notifications where kind = 'payment.received'"),
    );

    expect(vue.rows).toHaveLength(0);
  });
});
