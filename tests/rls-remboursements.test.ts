import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { refundPercent, type CancellationRule } from "@/lib/cancellation";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Annulation, remboursement, et retenue des versements.
 *
 * Trois garanties qui ne se vérifient qu'ici, contre un vrai Postgres :
 *
 * - **on ne verse pas avant la prestation** — c'est la règle qui empêche de
 *   rembourser un client avec de l'argent déjà parti chez le partenaire ;
 * - **un remboursement retombe exactement sur ce qui a été encaissé**, et la
 *   date repart au catalogue ;
 * - **le barème lu en SQL est celui lu en TypeScript**. L'écran annonce une
 *   somme, la base en inscrit une autre : c'est la divergence la plus coûteuse
 *   du lot, et la seule qu'aucun typage ne rattrape.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000a1"; // propriétaire du lieu
const CLIENTE = "bbbbbbbb-0000-4000-8000-0000000000b1"; // réserve et annule
const TIERS = "cccccccc-0000-4000-8000-0000000000c1"; // sans aucun lien
const ADMIN = "ffffffff-0000-4000-8000-0000000000f1";

let db: TestDatabase;
let org: string;
let annonce: string;

/**
 * Chaque réservation prend **sa propre date**.
 *
 * `book_listing` verrouille la date et la marque complète : réutiliser le même
 * jour d'un test à l'autre les ferait échouer les uns après les autres pour
 * une raison qui n'a rien à voir avec ce qu'ils vérifient.
 */
let prochainJour = 60;

/** Dans longtemps : la retenue s'applique, et le barème est au plus généreux. */
function bienPlusTard(): number {
  prochainJour += 1;
  return prochainJour;
}

async function reserver(decalageJours: number): Promise<string> {
  const jour = await db.query("select (current_date + $1::int)::date::text as d", [
    decalageJours,
  ]);
  const d = jour.rows[0].d as string;

  await db.query(
    `insert into availabilities (listing_id, date, price, inventory)
     values ($1, $2::date, 300000, 1)
     on conflict (listing_id, date, slot) do nothing`,
    [annonce, d],
  );

  return actingAs(db, CLIENTE, async () => {
    const out = await db.query("select id from book_listing($1, array[$2::date])", [annonce, d]);
    return out.rows[0].id as string;
  });
}

/** Règle la première échéance d'une commande, comme le ferait le webhook. */
async function regler(commande: string): Promise<number> {
  const echeance = await db.query(
    "select id from order_instalments where order_id = $1 order by position limit 1",
    [commande],
  );
  const cle = `cle-${echeance.rows[0].id}`;

  await actingAs(db, CLIENTE, async () => {
    await db.query("select start_payment($1, $2)", [echeance.rows[0].id, cle]);
  });

  // `settle_payment` est réservée à la clé de service : ici, en
  // superutilisateur, comme le ferait le webhook. La référence prestataire est
  // unique par transaction — c'est elle qui rend le webhook idempotent.
  await db.query("select settle_payment($1, $2, 'approved', true, null, null)", [
    cle,
    `tx-${cle}`,
  ]);

  const paye = await db.query(
    "select amount from payments where idempotency_key = $1",
    [cle],
  );
  return Number(paye.rows[0].amount);
}

/** Règle **toutes** les échéances, dans l'ordre que `start_payment` impose. */
async function reglerTout(commande: string): Promise<void> {
  const echeances = await db.query(
    "select id from order_instalments where order_id = $1 order by position",
    [commande],
  );

  for (const e of echeances.rows as { id: string }[]) {
    const cle = `cle-${e.id}`;
    await actingAs(db, CLIENTE, () => db.query("select start_payment($1, $2)", [e.id, cle]));
    await db.query("select settle_payment($1, $2, 'approved', true, null, null)", [
      cle,
      `tx-${cle}`,
    ]);
  }
}

/** Ce que l'administration pourrait verser au partenaire à cet instant. */
async function payable(): Promise<number> {
  return actingAs(db, ADMIN, async () => {
    const out = await db.query("select * from payout_candidates() where org_id = $1", [org]);
    return Number(out.rows[0]?.payable ?? 0);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',  'patron@lieu.bj',   '{"account_type":"partenaire"}'),
      ('${CLIENTE}', 'cliente@exemple.bj', '{"account_type":"particulier"}'),
      ('${TIERS}',   'tiers@exemple.bj',   '{"account_type":"particulier"}'),
      ('${ADMIN}',   'ops@enievent.bj',    '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Jardin de Fidjrosse', 'jardin-fidjrosse', 'active', '+2290197000001')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query(
    "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
    [org, PATRON],
  );

  const cat = await db.query(
    "select id from categories where kind = 'venue' order by slug limit 1",
  );

  // Barème flexible : remboursement intégral jusqu'à 7 jours avant. C'est le
  // seul qui permet de distinguer « rendu » de « retenu » sur un même jeu.
  const politique = await db.query(
    "select id from cancellation_policies where slug = 'flexible'",
  );

  const fiches = await db.query(
    `insert into listings
       (org_id, category_id, kind, title, slug, city, status, booking_mode,
        currency, cancellation_policy_id, published_at)
     values ($1, $2, 'venue', 'Jardin de Fidjrosse', 'jardin-fidjrosse-lieu', 'Cotonou',
             'approved', 'instant', 'XOF', $3, now())
     returning id`,
    [org, cat.rows[0].id, politique.rows[0].id],
  );
  annonce = fiches.rows[0].id as string;

  await db.query(
    `insert into payout_accounts (org_id, method, phone, holder_name)
     values ($1, 'mtn', '+2290197000002', 'Jardin de Fidjrosse')`,
    [org],
  );
});

afterAll(async () => {
  await db?.close?.();
});

describe("retenue des versements", () => {
  it("ne verse rien tant que la prestation n'a pas eu lieu", async () => {
    const commande = await reserver(bienPlusTard());
    const encaisse = await regler(commande);

    expect(encaisse).toBeGreaterThan(0);

    const file = await actingAs(db, ADMIN, async () => {
      const out = await db.query("select * from payout_candidates() where org_id = $1", [org]);
      return out.rows[0];
    });

    // L'argent est bien là — il est simplement retenu. Le taire ferait croire
    // au partenaire qu'on lui doit zéro.
    expect(Number(file.payable)).toBe(0);
    expect(Number(file.held)).toBeGreaterThan(0);
  });

  it("refuse de préparer un versement de ce qui est retenu", async () => {
    await expect(
      actingAs(db, ADMIN, () => db.query("select create_payout($1)", [org])),
    ).rejects.toThrow(/Rien à verser/);
  });

  it("libère le versement une fois la date passée", async () => {
    const commande = await reserver(-3);
    await regler(commande);

    const file = await actingAs(db, ADMIN, async () => {
      const out = await db.query("select * from payout_candidates() where org_id = $1", [org]);
      return out.rows[0];
    });

    expect(Number(file.payable)).toBeGreaterThan(0);
  });
});

describe("annulation par le client", () => {
  it("rembourse intégralement dans la fenêtre flexible, et rend la date", async () => {
    const commande = await reserver(bienPlusTard());
    const encaisse = await regler(commande);

    const issue = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from cancel_order($1, 'Changement de date')", [
        commande,
      ]);
      return out.rows[0];
    });

    expect(Number(issue.refund_percent)).toBe(100);
    expect(Number(issue.refunded)).toBe(encaisse);
    expect(Number(issue.retained)).toBe(0);
    expect(issue.status).toBe("refunded");

    // Ce qui est rendu et ce qui est retenu font exactement ce qui est entré.
    expect(Number(issue.retained) + Number(issue.refunded)).toBe(Number(issue.paid));

    const dispo = await db.query(
      `select a.capacity_used, a.status
         from availabilities a
         join orders o on o.listing_id = a.listing_id and a.date = o.start_date
        where o.id = $1`,
      [commande],
    );

    // Une réservation annulée qui garde son samedi condamne la date pour tout
    // le monde : c'est la panne que personne ne signale.
    expect(Number(dispo.rows[0].capacity_used)).toBe(0);
    expect(dispo.rows[0].status).toBe("open");
  });

  it("retire l'encaissement remboursé de ce qui est versable", async () => {
    // La commande annulée est « prête » au sens du calendrier, mais son
    // encaissement a été rendu : le partenaire ne doit rien toucher dessus.
    const avant = await actingAs(db, ADMIN, async () => {
      const out = await db.query("select * from payout_candidates() where org_id = $1", [org]);
      return Number(out.rows[0]?.payable ?? 0);
    });

    const commande = await reserver(bienPlusTard());
    await regler(commande);
    await actingAs(db, CLIENTE, () => db.query("select cancel_order($1)", [commande]));

    const apres = await actingAs(db, ADMIN, async () => {
      const out = await db.query("select * from payout_candidates() where org_id = $1", [org]);
      return Number(out.rows[0]?.payable ?? 0);
    });

    expect(apres).toBe(avant);
  });

  it("ne perd pas un franc sur un remboursement partiel", async () => {
    // Le cas qui dérive en silence : la commande est réglée en deux fois, le
    // barème n'en rend que la moitié. Le dernier encaissement est donc
    // **partiellement** repris — il reste `paid` et porte sa soustraction.
    const moderee = await db.query("select id from cancellation_policies where slug = 'moderee'");
    await db.query("update listings set cancellation_policy_id = $1 where id = $2", [
      moderee.rows[0].id,
      annonce,
    ]);

    // Entre 30 et 7 jours : la moitié est remboursée.
    const commande = await reserver(14);
    await reglerTout(commande);

    const avant = await payable();

    const issue = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from cancel_order($1)", [commande]);
      return out.rows[0];
    });

    const total = await db.query("select total from orders where id = $1", [commande]);

    expect(Number(issue.refund_percent)).toBe(50);
    expect(Number(issue.paid)).toBe(Number(total.rows[0].total));
    expect(Number(issue.retained) + Number(issue.refunded)).toBe(Number(issue.paid));

    // Le point du test : la part du partenaire encore due, plus celle reprise
    // par le remboursement, doit faire exactement sa part d'origine. Un franc
    // qui se perd ici ne lève aucune erreur — il apparaît en comptabilité.
    const comptes = await db.query(
      `select
         coalesce(sum(p.partner_due), 0)::bigint as brut,
         coalesce(sum(l.partner_due), 0)::bigint as repris
       from payments p
       left join refund_lines l on l.payment_id = p.id
       where p.order_id = $1`,
      [commande],
    );

    const delta = (await payable()) - avant;
    expect(delta).toBe(Number(comptes.rows[0].brut) - Number(comptes.rows[0].repris));

    // Et l'encaissement partiellement repris reste un encaissement.
    const etats = await db.query(
      "select count(*)::int as n from payments where order_id = $1 and status = 'paid'",
      [commande],
    );
    expect(etats.rows[0].n).toBeGreaterThan(0);
  });

  it("refuse une seconde annulation", async () => {
    const commande = await reserver(bienPlusTard());
    await actingAs(db, CLIENTE, () => db.query("select cancel_order($1)", [commande]));

    await expect(
      actingAs(db, CLIENTE, () => db.query("select cancel_order($1)", [commande])),
    ).rejects.toThrow(/déjà annulée/);
  });

  it("refuse l'annulation à qui n'a rien à voir avec la réservation", async () => {
    const commande = await reserver(bienPlusTard());

    await expect(
      actingAs(db, TIERS, () => db.query("select cancel_order($1)", [commande])),
    ).rejects.toThrow(/ne pouvez pas annuler/);
  });

  it("refuse d'annuler une prestation déjà rendue", async () => {
    const commande = await reserver(-5);

    await expect(
      actingAs(db, CLIENTE, () => db.query("select cancel_order($1)", [commande])),
    ).rejects.toThrow(/déjà eu lieu/);
  });
});

describe("désistement du partenaire", () => {
  it("rembourse intégralement, quel que soit le barème", async () => {
    // Le barème protège le prestataire du changement d'avis du client.
    // L'invoquer pour se désister soi-même reviendrait à facturer sa propre
    // défaillance : on passe donc l'annonce en « non remboursable » pour
    // vérifier que la règle prime bien sur le barème.
    const ferme = await db.query(
      "select id from cancellation_policies where slug = 'non-remboursable'",
    );
    await db.query("update listings set cancellation_policy_id = $1 where id = $2", [
      ferme.rows[0].id,
      annonce,
    ]);

    const commande = await reserver(bienPlusTard());
    const encaisse = await regler(commande);

    const issue = await actingAs(db, PATRON, async () => {
      const out = await db.query("select * from cancel_order($1, 'Salle indisponible')", [
        commande,
      ]);
      return out.rows[0];
    });

    expect(Number(issue.refund_percent)).toBe(100);
    expect(Number(issue.refunded)).toBe(encaisse);
  });
});

describe("cloisonnement des remboursements", () => {
  it("laisse le client et le partenaire voir le leur, et personne d'autre", async () => {
    // Barème rétabli explicitement : le test précédent l'a passé en « non
    // remboursable », et sans remboursement il n'y aurait aucune ligne à
    // cloisonner — le test passerait en ne vérifiant rien.
    const souple = await db.query("select id from cancellation_policies where slug = 'flexible'");
    await db.query("update listings set cancellation_policy_id = $1 where id = $2", [
      souple.rows[0].id,
      annonce,
    ]);

    const commande = await reserver(bienPlusTard());
    await regler(commande);
    await actingAs(db, CLIENTE, () => db.query("select cancel_order($1)", [commande]));

    const vus = async (user: string) =>
      actingAs(db, user, async () => {
        const out = await db.query("select count(*)::int as n from refunds where order_id = $1", [
          commande,
        ]);
        return out.rows[0].n as number;
      });

    expect(await vus(CLIENTE)).toBe(1);
    expect(await vus(PATRON)).toBe(1);
    expect(await vus(ADMIN)).toBe(1);

    // Le cas qui compte : un tiers ne doit rien voir. Une requête bloquée par
    // une clause `using` ne lève aucune erreur — elle rend zéro ligne.
    expect(await vus(TIERS)).toBe(0);
  });

  it("n'accorde à personne le droit d'écrire un remboursement à la main", async () => {
    await expect(
      actingAs(db, CLIENTE, () =>
        db.query(
          `insert into refunds (order_id, client_id, org_id, amount, refund_percent)
           values (gen_random_uuid(), $1, $2, 999999, 100)`,
          [CLIENTE, org],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("le barème SQL et le barème TypeScript", () => {
  it("rendent le même taux, jour pour jour", async () => {
    // Toute divergence est un bug : l'écran annonce une somme avant que le
    // client ne confirme, la base en inscrit une autre ensuite.
    const politiques = await db.query(
      "select id, slug from cancellation_policies order by slug",
    );

    // Le « aujourd'hui » vient de la base, pas de l'horloge de la machine :
    // comparer `current_date` à un `new Date()` local ferait passer ou échouer
    // ce test selon l'heure et le fuseau de celui qui le lance.
    const aujourdhui = await db.query("select current_date::text as d");
    const maintenant = new Date(`${aujourdhui.rows[0].d as string}T09:00:00Z`);

    for (const p of politiques.rows as { id: string; slug: string }[]) {
      const regles = await db.query(
        "select min_days_before, refund_percent from cancellation_rules where policy_id = $1",
        [p.id],
      );

      const bareme: CancellationRule[] = regles.rows.map((r) => ({
        minDaysBefore: Number(r.min_days_before),
        refundPercent: Number(r.refund_percent),
      }));

      // Les bornes exactes des barèmes (0, 7, 30, 60) et leurs voisines : c'est
      // là, et nulle part ailleurs, qu'une comparaison peut basculer.
      for (const jours of [-5, -1, 0, 1, 6, 7, 8, 29, 30, 31, 59, 60, 61, 200]) {
        const sql = await db.query(
          "select app.refund_percent($1, (current_date + $2::int)::date, current_date) as pct",
          [p.id, jours],
        );

        const evenement = await db.query("select (current_date + $1::int)::date::text as d", [
          jours,
        ]);
        const ts = refundPercent(bareme, evenement.rows[0].d as string, maintenant);

        expect(Number(sql.rows[0].pct), `${p.slug} à ${jours} jours`).toBe(ts);
      }

      // Sans date, les deux doivent choisir la règle la plus généreuse.
      const sansDate = await db.query(
        "select app.refund_percent($1, null, current_date) as pct",
        [p.id],
      );
      expect(Number(sansDate.rows[0].pct), `${p.slug} sans date`).toBe(
        refundPercent(bareme, null, maintenant),
      );
    }
  });
});
