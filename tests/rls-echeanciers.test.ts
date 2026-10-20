import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Échéanciers d'une commande — migration 0052.
 *
 * ⚠️ **Une échéance ne naît jamais déjà échue.**
 *
 * Constaté en production le 21 octobre 2026, sur CMD-202610-000141 : un devis
 * accepté la veille d'un événement du 22, chez un partenaire qui demande le
 * solde « 7 jours avant ». Le client lisait, le jour même de sa réservation :
 *
 *     Réservation   150 FCFA   à régler maintenant
 *     Solde         350 FCFA   à régler le 16 octobre 2026
 *
 * Une date de règlement dans le passé. Et comme `start_payment` impose l'ordre
 * des échéances, il aurait réglé l'acompte pour se retrouver aussitôt « en
 * retard » sur le reste — sans qu'aucun chemin ne lui permette de ne pas l'être.
 *
 * La règle est donc : **ce qui est déjà exigible le jour de la réservation est
 * fondu en un seul règlement, dû immédiatement**. Quand il ne reste rien
 * derrière, cela donne un paiement intégral.
 *
 * Ce qui ne doit **pas** changer, et que ces tests gardent autant que le reste :
 * la somme des échéances vaut exactement le total, un retard survenu *après* la
 * réservation reste un retard (pas un défaut à corriger), et une date d'événement
 * inconnue n'est pas une date passée.
 *
 * `src/lib/fees.ts` porte la même règle pour l'interface ; `tests/fees.test.ts`
 * la vérifie de son côté. Les deux doivent dire la même chose.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000e1";
const CLIENTE = "bbbbbbbb-0000-4000-8000-0000000000e1";

let db: TestDatabase;
let org: string;
let annonce: string;

/** Les conditions du partenaire, remplacées en entier à chaque cas. */
async function conditions(lignes: [string, "booking" | "before_event", number | null, number | null][]) {
  await db.query("delete from payment_schedules where org_id = $1", [org]);

  let rang = 0;
  for (const [label, trigger, daysBefore, percent] of lignes) {
    await db.query(
      `insert into payment_schedules
         (org_id, position, label, trigger, days_before, amount_kind, percent)
       values ($1, $2, $3, $4::schedule_trigger, $5, $6::schedule_amount, $7)`,
      [
        org,
        rang,
        label,
        trigger,
        daysBefore,
        percent === null ? "balance" : "percent",
        percent,
      ],
    );
    rang += 1;
  }
}

/** Réserve `annonce` pour un jour donné, et rend les échéances posées. */
async function reserver(dansJours: number, prix: number) {
  const jour = await db.query("select (current_date + $1::int)::date::text as d", [dansJours]);
  const d = jour.rows[0].d as string;

  await db.query(
    // Les cas rejouent les mêmes jours : la date est remise à l'état ouvert
    // plutôt que de dépendre de l'ordre d'exécution.
    `insert into availabilities (listing_id, date, price, inventory)
     values ($1, $2::date, $3, 1)
     on conflict (listing_id, date, slot) do update
       set price = excluded.price, inventory = 1, capacity_used = 0, status = 'open'`,
    [annonce, d, prix],
  );

  const cmd = await actingAs(db, CLIENTE, async () => {
    const out = await db.query("select * from book_listing($1, array[$2::date])", [annonce, d]);
    return out.rows[0] as { id: string; total: string };
  });

  const echeances = await db.query(
    `select position, label, amount::bigint as amount, due_date::text as due_date,
            (due_date = current_date) as aujourdhui
       from order_instalments where order_id = $1 order by position`,
    [cmd.id],
  );

  return {
    id: cmd.id,
    total: Number(cmd.total),
    lignes: echeances.rows as {
      position: number;
      label: string;
      amount: string;
      due_date: string | null;
      aujourdhui: boolean | null;
    }[],
  };
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',  'patron@echeances.bj',  '{"account_type":"partenaire"}'),
      ('${CLIENTE}', 'cliente@echeances.bj', '{"account_type":"particulier"}');
  `);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle Echeances', 'salle-echeances', 'active', '+2290197000020')
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
     values ($1, $2, 'venue', 'Salle Echeances', 'salle-echeances-fiche', 'Cotonou',
             'approved', 'instant', 'XOF', now())
     returning id`,
    [org, cat.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;
});

afterAll(async () => {
  await db?.close?.();
});

describe("une échéance ne naît jamais déjà échue", () => {
  it("réclame la totalité quand l'événement est trop proche", async () => {
    // Le cas de production, rejoué : 30 % à la réservation, solde 7 jours
    // avant, événement demain.
    await conditions([
      ["Réservation", "booking", null, 30],
      ["Solde", "before_event", 7, null],
    ]);

    // Le tarif minimum d'une annonce est de 1 000 F : le cas de production
    // portait sur 500 F, né du tunnel de devis, qui n'a pas ce plancher.
    const { lignes, total } = await reserver(1, 5_000);

    expect(lignes).toHaveLength(1);
    expect(Number(lignes[0].amount)).toBe(total);
    expect(lignes[0].label).toBe("Paiement intégral");
    expect(lignes[0].aujourdhui).toBe(true);
  });

  it("ne fond que ce qui est échu, et laisse le reste à sa date", async () => {
    // Événement dans 30 jours : le versement « 90 jours avant » est derrière
    // nous, le solde « 7 jours avant » non.
    await conditions([
      ["Acompte", "booking", null, 30],
      ["Deuxième versement", "before_event", 90, 40],
      ["Solde", "before_event", 7, null],
    ]);

    const { lignes, total } = await reserver(30, 1_000_000);

    expect(lignes).toHaveLength(2);
    expect(Number(lignes[0].amount)).toBe(700_000);
    expect(lignes[0].aujourdhui).toBe(true);
    expect(Number(lignes[1].amount)).toBe(300_000);
    expect(lignes.reduce((t, l) => t + Number(l.amount), 0)).toBe(total);
  });

  it("garde le libellé du partenaire quand rien n'a été fondu", async () => {
    // Une seule échéance exigible, c'est l'acompte habituel : le renommer
    // reviendrait à réécrire les conditions du partenaire sans qu'il l'ait
    // demandé.
    await conditions([
      ["Acompte à la réservation", "booking", null, 30],
      ["Solde", "before_event", 7, null],
    ]);

    const { lignes } = await reserver(120, 1_000_000);

    expect(lignes).toHaveLength(2);
    expect(lignes[0].label).toBe("Acompte à la réservation");
    expect(lignes[1].label).toBe("Solde");
  });

  it("numérote les positions sans trou après une fusion", async () => {
    // `start_payment` compte les échéances de position inférieure pour imposer
    // l'ordre, et `OrderPayment` n'offre un bouton qu'à la première non réglée.
    // Un trou dans la numérotation n'est pas visible à l'œil nu et ne lève
    // aucune erreur — il décale simplement tout ce qui s'appuie dessus.
    await conditions([
      ["Acompte", "booking", null, 20],
      ["Deuxième versement", "before_event", 200, 20],
      ["Troisième versement", "before_event", 60, 20],
      ["Solde", "before_event", 7, null],
    ]);

    const { lignes } = await reserver(90, 800_000);

    expect(lignes.map((l) => l.position)).toEqual([0, 1, 2]);
  });

  it("n'émet jamais une date de règlement antérieure à aujourd'hui", async () => {
    // Le contrôle qui compte, sur tout ce qui tombe mal. Et la somme doit
    // rester exactement le total : la fusion additionne, elle ne recalcule pas.
    await conditions([
      ["Acompte", "booking", null, 25],
      ["Deuxième versement", "before_event", 60, 25],
      ["Troisième versement", "before_event", 30, 25],
      ["Solde", "before_event", 7, null],
    ]);

    for (const dans of [1, 3, 8, 31, 61, 120]) {
      const { id, lignes, total } = await reserver(dans, 1_234_567);

      expect(lignes.length, `événement dans ${dans} jours`).toBeGreaterThan(0);
      expect(lignes.reduce((t, l) => t + Number(l.amount), 0), `dans ${dans} jours`).toBe(total);

      const passees = await db.query(
        `select count(*)::int as n from order_instalments
          where order_id = $1 and due_date is not null and due_date < current_date`,
        [id],
      );
      expect(passees.rows[0].n, `dans ${dans} jours`).toBe(0);
    }
  });

  it("ne confond pas une date inconnue avec une date passée", async () => {
    // Une date souple est fréquente sur un mariage. Le solde attend que la date
    // se fixe ; le réclamer tout de suite serait un faux.
    await conditions([
      ["Acompte", "booking", null, 30],
      ["Solde", "before_event", 7, null],
    ]);

    const cmd = await db.query(
      `insert into orders (client_id, org_id, total, currency, commission_rate, listing_id,
                           cancellation_policy_id)
       values ($1, $2, 1000000, 'XOF', 10, $3, app.policy_for_listing($3))
       returning id`,
      [CLIENTE, org, annonce],
    );

    await db.query("select app.build_instalments($1)", [cmd.rows[0].id]);

    const lignes = await db.query(
      "select label, due_date::text as due_date from order_instalments where order_id = $1 order by position",
      [cmd.rows[0].id],
    );

    expect(lignes.rows).toHaveLength(2);
    expect(lignes.rows[1].due_date).toBeNull();
  });
});
