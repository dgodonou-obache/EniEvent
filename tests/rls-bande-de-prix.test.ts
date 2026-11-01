import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { priceBand } from "@/lib/planning";
import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Bande de sécurité d'un tarif journalier — migration 0054.
 *
 * ⚠️ **Le plafond ne se bâtit pas sur un minimum.** Signalé le 1er novembre
 * 2026 : un partenaire voulant porter ses dates de 100 000 à 250 000 F se
 * voyait répondre « le maximum accepté est 2 500 FCFA », sur une annonce dont
 * le calendrier contenait au même instant **125 dates à 100 000 F et 6 à
 * 150 000 F**.
 *
 * Plancher et plafond se déduisaient tous deux de `listings.price_from`, qui
 * est le **plus bas** des tarifs de base. Une seule règle à 500 F, posée pour
 * éprouver les paiements réels, avait donc fait tomber le plafond à 2 500 F —
 * et il n'y avait pas de retour : chaque baisse rabaissait le plafond, et le
 * plafond interdisait de remonter.
 *
 * ⚠️ **C'est le déclencheur qui protège, pas l'écran.** `validateBulkEdit`
 * refuse en français avant d'écrire ; `app.enforce_min_price` refuse quoi qu'il
 * arrive, y compris à un appel direct de l'API. Les deux doivent dire le même
 * chiffre — le dernier cas de ce fichier les compare.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000b1";

let db: TestDatabase;
let org: string;

/** Crée une annonce avec ses tarifs de base, et rend son identifiant. */
async function annonce(slug: string, tarifs: number[], minPrice: number | null = null) {
  const cat = await db.query("select id from categories where kind = 'venue' order by slug limit 1");

  const fiche = await db.query(
    `insert into listings
       (org_id, category_id, kind, title, slug, city, status, booking_mode, currency,
        published_at, min_price)
     values ($1, $2, 'venue', $3, $4, 'Cotonou', 'approved', 'instant', 'XOF', now(), $5)
     returning id`,
    // `title` et `slug` ne portent pas le même type — le second est `citext`,
    // et un paramètre partagé entre les deux fait échouer la déduction.
    [org, cat.rows[0].id, slug, slug, minPrice],
  );
  const id = fiche.rows[0].id as string;

  for (const tarif of tarifs) {
    await db.query(
      "insert into pricing_rules (listing_id, unit, base_price) values ($1, 'day', $2)",
      [id, tarif],
    );
  }

  return id;
}

/** Tente d'ouvrir une date à un tarif. Rend le motif du refus, ou `null`. */
async function ouvrir(fiche: string, date: string, prix: number): Promise<string | null> {
  try {
    await db.query(
      `insert into availabilities (listing_id, date, price, inventory, status)
       values ($1, $2::date, $3, 1, 'open')
       on conflict (listing_id, date, slot) do update set price = excluded.price, status = 'open'`,
      [fiche, date, prix],
    );
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}', 'patron@bande.bj', '{"account_type":"partenaire"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Bande', 'salle-bande', 'active', '+2290197000040')
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
  await db?.close?.();
});

describe("le plafond suit le tarif le plus haut", () => {
  it("laisse remonter une annonce dont une règle est très basse", async () => {
    // Le cas de production, rejoué : une règle à 500 F posée pour éprouver les
    // paiements, et un calendrier déjà vendu 100 000 F.
    const fiche = await annonce("jardin-bande", [500], 250);

    // `price_from` vaut 500 : sans la correction, le plafond vaudrait 2 500 F.
    const lu = await db.query("select price_from from listings where id = $1", [fiche]);
    expect(Number(lu.rows[0].price_from)).toBe(500);

    expect(await ouvrir(fiche, "2027-03-01", 1_000)).toBeNull();
    expect(await ouvrir(fiche, "2027-03-02", 5_000)).toBeNull();
    expect(await ouvrir(fiche, "2027-03-03", 25_000)).toBeNull();
    expect(await ouvrir(fiche, "2027-03-04", 100_000)).toBeNull();

    // Et le geste refusé en production : 250 000 sur une annonce qui vend
    // déjà 100 000.
    expect(await ouvrir(fiche, "2027-03-05", 250_000)).toBeNull();
  });

  /**
   * ⚠️ Le contrôle qui prouve que la bande protège encore. Sans lui, « le
   * plafond suit le plus haut » pourrait être implémenté en supprimant le
   * plafond — et les deux cas ci-dessus passeraient au vert.
   */
  it("attrape toujours le zéro de trop", async () => {
    const fiche = await annonce("etoile-bande", [100_000]);

    expect(await ouvrir(fiche, "2027-04-01", 150_000)).toBeNull();

    // 5 × 150 000 = 750 000. Un zéro de trop sur 150 000 est refusé.
    const refus = await ouvrir(fiche, "2027-04-02", 1_500_000);
    expect(refus).toMatch(/trop élevé/);
  });

  it("ne laisse pas un tarif se justifier lui-même", async () => {
    // Le piège du déclencheur `before` : s'il comptait la ligne en cours
    // d'écriture dans le maximum, tout tarif deviendrait son propre plafond et
    // la borne haute ne refuserait plus jamais rien.
    const fiche = await annonce("auditorium-bande", [10_000]);

    const refus = await ouvrir(fiche, "2027-05-01", 10_000_000);
    expect(refus).toMatch(/trop élevé/);
  });

  it("garde le plancher sur le tarif d'entrée", async () => {
    // Les deux bornes répondent à deux questions : le sommet ne relève pas le
    // plancher, sinon une annonce à large éventail ne pourrait plus ouvrir une
    // date à son prix d'appel.
    const fiche = await annonce("eventail-bande", [20_000]);

    expect(await ouvrir(fiche, "2027-06-01", 100_000)).toBeNull();
    // Le plancher reste 20 % de 20 000, soit 4 000 — et non 20 % de 100 000.
    expect(await ouvrir(fiche, "2027-06-02", 4_000)).toBeNull();
    expect(await ouvrir(fiche, "2027-06-03", 3_000)).toMatch(/trop bas/);
  });

  it("n'oppose aucun plafond à une date fermée ni à un tarif absent", async () => {
    const fiche = await annonce("ferme-bande", [10_000]);

    await db.query(
      `insert into availabilities (listing_id, date, price, inventory, status)
       values ($1, '2027-07-01'::date, 9999999, 1, 'closed')`,
      [fiche],
    );

    const lu = await db.query(
      "select price from availabilities where listing_id = $1 and date = '2027-07-01'",
      [fiche],
    );
    expect(Number(lu.rows[0].price)).toBe(9_999_999);
  });
});

/**
 * ⚠️ **Les deux bandes doivent dire le même chiffre.** L'écran refuse en
 * français avant d'écrire, la base refuse quoi qu'il arrive — et une divergence
 * entre les deux donne un formulaire qui accepte puis une erreur Postgres
 * illisible, ou l'inverse : un refus que rien ne justifie.
 */
describe("accord entre l'écran et la base", () => {
  // Deux tarifs de base : 500 pour une formule d'appel, 100 000 pour la journée
  // entière. `price_from` retient le plus bas, le sommet le plus haut — c'est
  // exactement la situation que la bande doit savoir lire.
  const TARIFS = [500, 100_000];
  const BANDE = priceBand({ minPrice: null, referencePrice: 500, peakPrice: 100_000 });

  it("calcule la même bande des deux côtés", () => {
    expect(BANDE.floor).toBe(100);
    expect(BANDE.ceiling).toBe(500_000);
  });

  /**
   * ⚠️ **Une annonce par borne.** Écrire une date la fait entrer dans le sommet
   * de l'annonce : poser le plafond puis le dépasser sur la **même** fiche ne
   * prouve rien, la seconde écriture étant jugée contre une bande que la
   * première vient d'élargir. C'est ce qui a d'abord fait passer ce contrôle au
   * vert pour la mauvaise raison.
   */
  it("accepte au plafond et refuse juste au-dessus", async () => {
    const dessous = await annonce("accord-plafond-ok", TARIFS);
    expect(await ouvrir(dessous, "2027-08-02", BANDE.ceiling!)).toBeNull();

    const dessus = await annonce("accord-plafond-ko", TARIFS);
    expect(await ouvrir(dessus, "2027-08-03", BANDE.ceiling! + 1)).toMatch(/trop élevé/);
  });

  it("accepte au plancher et refuse juste en dessous", async () => {
    const dessus = await annonce("accord-plancher-ok", TARIFS);
    expect(await ouvrir(dessus, "2027-08-04", BANDE.floor)).toBeNull();

    const dessous = await annonce("accord-plancher-ko", TARIFS);
    expect(await ouvrir(dessous, "2027-08-05", BANDE.floor - 1)).toMatch(/trop bas/);
  });

  /**
   * ⚠️ **La bande suit l'annonce, donc elle bouge — et c'est assumé.** Une date
   * ouverte au plafond entre dans le sommet, et le plafond suivant vaut cinq
   * fois celle-là. Un partenaire décidé peut donc monter par paliers de cinq.
   *
   * C'est le bon compromis : la bande est là pour attraper **un doigt qui
   * glisse**, pas pour arbitrer une politique tarifaire. Un zéro de trop en une
   * saisie reste refusé ; une suite de décisions délibérées, non — et rien ne
   * justifierait qu'on s'y oppose.
   */
  it("monte par paliers, et refuse toujours le zéro de trop en une fois", async () => {
    const fiche = await annonce("paliers-bande", [10_000]);

    expect(await ouvrir(fiche, "2027-10-01", 100_000)).toMatch(/trop élevé/);
    expect(await ouvrir(fiche, "2027-10-01", 50_000)).toBeNull();
    expect(await ouvrir(fiche, "2027-10-02", 250_000)).toBeNull();
  });
});

describe("la bande s'applique aussi sans navigateur", () => {
  it("refuse un appel direct du partenaire", async () => {
    // `validateBulkEdit` vit dans l'écran : quelqu'un qui écrit sa requête
    // lui-même ne la rencontre jamais. C'est le déclencheur qui tient.
    const fiche = await annonce("direct-bande", [10_000]);

    await expect(
      actingAs(db, PATRON, () =>
        db.query(
          `insert into availabilities (listing_id, date, price, inventory, status)
           values ($1, '2027-09-01'::date, 5000000, 1, 'open')`,
          [fiche],
        ),
      ),
    ).rejects.toThrow(/trop élevé/);
  });
});
