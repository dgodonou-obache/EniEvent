import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Avis, signalements, litiges — et la faille que ce lot a dû refermer d'abord.
 *
 * Tout ce qui est vérifié ici l'est **en se faisant passer pour quelqu'un**
 * (`actingAs`) : une requête lancée en superutilisateur contourne la RLS comme
 * les droits de colonne, et ne prouverait rien.
 */

const ALICE = "a11ce000-0000-4000-8000-0000000000a1"; // partenaire, Saveurs
const BOB = "b0b00000-0000-4000-8000-0000000000b1"; // partenaire concurrent
const CLARA = "c1a4a000-0000-4000-8000-0000000000c1"; // cliente
const ADMIN = "ad111000-0000-4000-8000-0000000000d1";

let db: TestDatabase;
let orgAlice: string;
let orgBob: string;
let annonceAlice: string;
let bareme: string;

/**
 * Fabrique une commande dans l'état qui ouvre le droit à l'avis : réglée, et
 * dont la dernière date est passée.
 *
 * Tout passe par le superutilisateur : une commande naît d'un déclencheur et un
 * paiement d'une fonction `security definer` (migration 0026) — il n'existe
 * aucun chemin client pour les écrire, et c'est voulu.
 */
async function commandeTerminee(
  options: { client: string; org: string; annonce?: string | null; fin?: string; reglee?: boolean } = {
    client: CLARA,
    org: "",
  },
): Promise<string> {
  const fin = options.fin ?? "2026-01-10";

  // ⚠️ `order_has_an_origin` : une commande vient d'un devis **ou** d'une
  // annonce (migration 0029). Sans annonce, il faut donc la chaîne de devis —
  // c'est précisément le cas que ce lot doit savoir noter.
  let devis: string | null = null;
  if (!options.annonce) {
    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const demandes = await db.query(
      `insert into quote_requests (requester_id, title, city, event_date, status)
       values ($1, 'Mariage à Cotonou', 'Cotonou', $2, 'closed') returning id`,
      [options.client, fin],
    );
    const besoins = await db.query(
      "insert into quote_request_items (request_id, category_id) values ($1, $2) returning id",
      [demandes.rows[0].id, cats[0].id],
    );
    const propositions = await db.query(
      `insert into quotes (item_id, org_id, subtotal, status)
       values ($1, $2, 600000, 'accepted') returning id`,
      [besoins.rows[0].id, options.org],
    );
    devis = propositions.rows[0].id as string;
  }

  const { rows } = await db.query(
    `insert into orders (org_id, client_id, listing_id, quote_id, total, commission_rate, status,
       event_date, start_date, end_date, cancellation_policy_id, listing_title)
     values ($1, $2, $3, $4, 600000, 10, 'paid', $5, $5, $5, $6, 'Buffet béninois')
     returning id`,
    [options.org, options.client, options.annonce ?? null, devis, fin, bareme],
  );
  const commande = rows[0].id as string;

  const { rows: echeances } = await db.query(
    `insert into order_instalments (order_id, position, label, amount, due_date)
     values ($1, 0, 'Solde', 600000, $2) returning id`,
    [commande, fin],
  );

  if (options.reglee !== false) {
    await db.query(
      `insert into payments (order_id, instalment_id, amount, commission, partner_due,
         idempotency_key, status, paid_at)
       values ($1, $2, 600000, 60000, 540000, $3, 'paid', now())`,
      [commande, echeances[0].id, `cle-${commande}`],
    );
  }

  return commande;
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@saveurs.bj', '{"account_type":"partenaire"}'),
      ('${BOB}',   'bob@deco.bj',      '{"account_type":"partenaire"}'),
      ('${CLARA}', 'clara@exemple.bj', '{"account_type":"particulier"}'),
      ('${ADMIN}', 'ops-avis@enievent.bj', '{}');
  `);

  // ⚠️ `app.handle_new_user` refuse un `account_type` « admin » demandé à
  // l'inscription (0006) : le rôle se pose ici, en superutilisateur.
  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status) values
      ('partner', 'Saveurs du Bénin', 'saveurs-avis', 'active'),
      ('partner', 'Deco Atlantique',  'deco-avis',    'active')
    returning id, slug
  `);
  const parSlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgAlice = parSlug["saveurs-avis"];
  orgBob = parSlug["deco-avis"];

  await db.exec(`
    insert into partner_profiles (org_id) values ('${orgAlice}'), ('${orgBob}')
      on conflict (org_id) do nothing;

    insert into organization_members (org_id, org_type, user_id, role) values
      ('${orgAlice}', 'partner', '${ALICE}', 'owner'),
      ('${orgBob}',   'partner', '${BOB}',   'owner');
  `);

  await db.query("update profiles set full_name = 'Clara Gbaguidi' where id = $1", [CLARA]);

  const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
  const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");
  bareme = baremes[0].id as string;

  const annonces = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status, cancellation_policy_id)
     values ($1, $2, 'service', 'Buffet béninois', 'buffet-avis', 'Cotonou', 'approved', $3)
     returning id`,
    [orgAlice, cats[0].id, baremes[0].id],
  );
  annonceAlice = annonces.rows[0].id as string;
});

afterAll(async () => {
  await db?.close();
});

/**
 * ⚠️ **La faille refermée par la migration 0047.**
 *
 * `0003_catalogue.sql:597` accordait `insert, update, delete` sur treize
 * tables d'un coup, dont `listings`. Combiné à `listings_update`, qui ouvre la
 * ligne entière au propriétaire, un partenaire écrivait sa propre note — et le
 * tri par défaut du catalogue est `rating_avg desc`.
 *
 * Ces trois contrôles **doivent repasser au rouge** si quelqu'un remet un
 * `grant update on listings` par commodité. Le premier tombe sur le droit de
 * colonne, les deux suivants sur le déclencheur de garde, qui existe
 * précisément pour ce jour-là.
 */
describe("notes non falsifiables", () => {
  it("refuse au partenaire d'écrire la note de son annonce", async () => {
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set rating_avg = 5, rating_count = 128 where id = $1", [
          annonceAlice,
        ]),
      ).rejects.toThrow(/permission denied|insufficient|ne s'écrivent pas/i);
    });
  });

  it("refuse aussi le prix d'appel, qui se déduit des tarifs", async () => {
    // `price_from` n'est pas qu'un critère de tri : c'est le prix **affiché au
    // client** sur la carte. Écrit à la main, il annonce une somme qui
    // n'existe dans aucune règle de tarification.
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set price_from = 1 where id = $1", [annonceAlice]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("refuse de reculer la date de publication", async () => {
    // Départage du tri par défaut : la reculer, c'est se déclarer plus récent
    // que tout le monde, définitivement.
    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("update listings set published_at = now() + interval '1 year' where id = $1", [
          annonceAlice,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("laisse le partenaire modifier ce qui le regarde", async () => {
    // ⚠️ Le contre-test compte autant : une énumération positive trop serrée
    // est une panne, pas une protection. Ce sont exactement les colonnes
    // qu'écrit `updateListing`.
    const { affectedRows } = await actingAs(db, ALICE, async () =>
      db.query(
        `update listings set title = 'Buffet béninois premium', description = 'Six plats',
           city = 'Porto-Novo', district = 'Dowa', booking_mode = 'instant',
           payment_terms = '50 % à la commande', min_price = 400000,
           min_notice_days = 7, is_paused = true, cover_url = 'https://exemple.bj/a.jpg',
           seo_title = 'Buffet', seo_description = 'Traiteur à Cotonou'
         where id = $1`,
        [annonceAlice],
      ),
    );

    expect(affectedRows).toBe(1);

    await db.query("update listings set is_paused = false where id = $1", [annonceAlice]);
  });

  it("laisse le partenaire créer une annonce", async () => {
    // L'`insert` est énuméré lui aussi : sans cela, créer une annonce
    // échouerait sur une colonne absente du grant — et le message ne nommerait
    // que `permission denied for table listings`.
    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");

    const { rows } = await actingAs(db, ALICE, async () =>
      db.query(
        `insert into listings (org_id, category_id, kind, title, slug, city, district,
           booking_mode, cancellation_policy_id, status)
         values ($1, $2, 'service', 'Cocktail', 'cocktail-avis', 'Cotonou', 'Fidjrossè',
           'quote', $3, 'draft')
         returning id, rating_count`,
        [orgAlice, cats[0].id, baremes[0].id],
      ),
    );

    expect(rows[0].rating_count).toBe(0);
  });

  it("refuse de nommer la note à la création", async () => {
    // Le droit d'`insert` est énuméré : la colonne absente de la liste ne peut
    // pas être nommée du tout, elle prend sa valeur par défaut.
    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const { rows: baremes } = await db.query("select id from cancellation_policies limit 1");

    await actingAs(db, ALICE, async () => {
      await expect(
        db.query(
          `insert into listings (org_id, category_id, kind, title, slug, city,
             cancellation_policy_id, rating_avg, rating_count)
           values ($1, $2, 'service', 'Triche', 'triche-avis', 'Cotonou', $3, 5, 99)`,
          [orgAlice, cats[0].id, baremes[0].id],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("refuse à un concurrent de dégrader la note d'autrui", async () => {
    // Bob est propriétaire de sa structure, pas de celle d'Alice : la RLS le
    // masque, donc l'`update` touche zéro ligne sans lever d'erreur. C'est le
    // cas silencieux du §3 du guide — seul le compte le révèle.
    const { affectedRows } = await actingAs(db, BOB, async () =>
      db.query("update listings set title = 'Sabotage' where id = $1", [annonceAlice]),
    );

    expect(affectedRows).toBe(0);
  });

  it("laisse l'administration corriger une note", async () => {
    // Un administrateur est lui aussi `authenticated` : un droit de colonne ne
    // sait pas l'en distinguer, et le déclencheur l'exempte explicitement —
    // même moule que `app.guard_privilege_columns` (0021). Sans cette porte,
    // aucune correction manuelle ne serait possible après un incident.
    const { rows } = await actingAs(db, ADMIN, async () =>
      db.query(
        "update listings set moderation_notes = 'Vérifié' where id = $1 returning moderation_notes",
        [annonceAlice],
      ),
    );

    expect(rows[0].moderation_notes).toBe("Vérifié");
  });
});

/**
 * L'éligibilité : trois faits vérifiables, et aucun état inventé.
 *
 * `order_status` ne dit nulle part qu'une prestation a eu lieu. On ne lui
 * ajoute pas un état que personne ne marquerait — `acceptance_rate` a passé un
 * an en colonne morte pour cette raison. L'éligibilité se déduit donc, et c'est
 * un **déclencheur** qui l'impose : la RLS dit quelles lignes, jamais à quelles
 * conditions.
 */
describe("qui peut donner son avis", () => {
  it("accepte le client d'une prestation réglée et passée", async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });

    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        `insert into reviews (order_id, rating, body)
         values ($1, 5, 'Buffet parfait, service ponctuel.')
         returning id, author_label, org_id, listing_id`,
        [commande],
      ),
    );

    // Tout ce qui compte est **dérivé**, jamais reçu : le formulaire n'envoie
    // que la commande, la note et le texte.
    expect(rows[0].org_id).toBe(orgAlice);
    expect(rows[0].listing_id).toBe(annonceAlice);
    expect(rows[0].author_label).toBe("Clara G.");
  });

  it("refuse un second avis sur la même commande", async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, CLARA, async () => {
      await db.query("insert into reviews (order_id, rating) values ($1, 4)", [commande]);

      await expect(
        db.query("insert into reviews (order_id, rating) values ($1, 1)", [commande]),
      ).rejects.toThrow(/unique|duplicate/i);
    });
  });

  it("refuse de noter la réservation de quelqu'un d'autre", async () => {
    // Le cas qui compte : BOB vise la commande de CLARA. `author_id` étant
    // dérivé d'`auth.uid()`, il ne peut pas se faire passer pour elle — le
    // déclencheur constate que la commande n'est pas la sienne.
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, BOB, async () => {
      await expect(
        db.query("insert into reviews (order_id, rating) values ($1, 1)", [commande]),
      ).rejects.toThrow(/Seul le client/i);
    });
  });

  it("refuse avant que la prestation soit passée", async () => {
    const commande = await commandeTerminee({
      client: CLARA,
      org: orgAlice,
      annonce: annonceAlice,
      fin: "2099-06-01",
    });

    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("insert into reviews (order_id, rating) values ($1, 5)", [commande]),
      ).rejects.toThrow(/lendemain/i);
    });
  });

  it("refuse tant que rien n'est encaissé", async () => {
    const commande = await commandeTerminee({
      client: CLARA,
      org: orgAlice,
      annonce: annonceAlice,
      reglee: false,
    });

    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("insert into reviews (order_id, rating) values ($1, 5)", [commande]),
      ).rejects.toThrow(/encaiss/i);
    });
  });

  it("refuse sur une réservation annulée", async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });
    await db.query("update orders set status = 'cancelled' where id = $1", [commande]);

    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("insert into reviews (order_id, rating) values ($1, 1)", [commande]),
      ).rejects.toThrow(/annulée ne se note pas/i);
    });
  });

  it("accepte un avis né d'un devis, sans annonce", async () => {
    // `orders.listing_id` reste nul quand la commande vient d'un devis
    // (migration 0029). L'avis note alors le prestataire sans noter d'annonce,
    // ce qui est exact : le devis portait sur un projet, pas sur une fiche.
    const commande = await commandeTerminee({ client: CLARA, org: orgBob, annonce: null });

    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        "insert into reviews (order_id, rating) values ($1, 4) returning listing_id, org_id",
        [commande],
      ),
    );

    expect(rows[0].listing_id).toBeNull();
    expect(rows[0].org_id).toBe(orgBob);
  });

  it("refuse de nommer l'organisation notée", async () => {
    // Les droits de colonne limitent l'écriture à trois champs. Nommer
    // `org_id` permettrait de noter un concurrent sous couvert de sa propre
    // commande.
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("insert into reviews (order_id, rating, org_id) values ($1, 1, $2)", [
          commande,
          orgBob,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

/** Crée un partenaire et une annonce isolés, pour que les moyennes ne se mêlent pas. */
async function partenaireNeuf(nom: string): Promise<{ org: string; annonce: string }> {
  const orgs = await db.query(
    `insert into organizations (type, legal_name, slug, status)
     values ('partner', $1, $2, 'active') returning id`,
    [nom, nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
  );
  const org = orgs.rows[0].id as string;
  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);

  const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
  const annonces = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status, cancellation_policy_id)
     values ($1, $2, 'service', $3, $4, 'Cotonou', 'approved', $5) returning id`,
    [org, cats[0].id, nom, `${nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-annonce`, bareme],
  );

  return { org, annonce: annonces.rows[0].id as string };
}

/** Dépose un avis en tant que CLARA sur une commande fabriquée pour l'occasion. */
async function deposer(
  org: string,
  annonce: string | null,
  note: number,
  texte: string | null = null,
): Promise<string> {
  const commande = await commandeTerminee({ client: CLARA, org, annonce });
  const { rows } = await actingAs(db, CLARA, async () =>
    db.query("insert into reviews (order_id, rating, body) values ($1, $2, $3) returning id", [
      commande,
      note,
      texte,
    ]),
  );
  return rows[0].id as string;
}

describe("les notes recalculées", () => {
  it("remplit l'annonce et le profil du partenaire", async () => {
    // Le déclencheur promis par la migration 0002 et jamais écrit.
    const { org, annonce } = await partenaireNeuf("Notes Test");

    for (const note of [5, 4, 3]) await deposer(org, annonce, note);

    const { rows: a } = await db.query(
      "select rating_avg, rating_count from listings where id = $1",
      [annonce],
    );
    expect(Number(a[0].rating_avg)).toBe(4);
    expect(a[0].rating_count).toBe(3);

    const { rows: p } = await db.query(
      "select rating_avg, rating_count from partner_profiles where org_id = $1",
      [org],
    );
    expect(Number(p[0].rating_avg)).toBe(4);
    expect(p[0].rating_count).toBe(3);
  });

  it("compte sur le profil les avis venus d'un devis, sans annonce", async () => {
    const { org, annonce } = await partenaireNeuf("Devis Test");

    await deposer(org, annonce, 4);
    await deposer(org, null, 2);

    // L'annonce ne connaît que le sien ; le profil agrège les deux.
    const { rows: a } = await db.query("select rating_count from listings where id = $1", [annonce]);
    expect(a[0].rating_count).toBe(1);

    const { rows: p } = await db.query(
      "select rating_avg, rating_count from partner_profiles where org_id = $1",
      [org],
    );
    expect(p[0].rating_count).toBe(2);
    expect(Number(p[0].rating_avg)).toBe(3);
  });

  it("n'entre dans le classement qu'à partir de trois avis", async () => {
    // ⚠️ Le tri par défaut du catalogue est `rating_avg desc`. Sans ce seuil,
    // **le premier avis déposé réordonne tout le catalogue** : un unique « 5 »
    // battrait une annonce notée 4,8 sur cinquante avis.
    const { org, annonce } = await partenaireNeuf("Seuil Test");

    const lire = async () =>
      (await db.query("select rating_avg, rating_sort from listing_search where id = $1", [annonce]))
        .rows[0];

    await deposer(org, annonce, 5);
    await deposer(org, annonce, 5);

    const deux = await lire();
    expect(Number(deux.rating_avg)).toBe(5);
    expect(deux.rating_sort).toBeNull();

    await deposer(org, annonce, 5);

    const trois = await lire();
    expect(Number(trois.rating_sort)).toBe(5);
  });

  /**
   * ⚠️ **La garantie centrale de la décision du 11 octobre 2026.**
   *
   * Retirer le commentaire d'un avis ne soulage **pas** la note. Si cette
   * assertion tombe, « contenu illicite » redevient le moyen de faire
   * disparaître un 1/5 et on est revenu au point de départ par la porte de
   * service — sans qu'aucune erreur n'apparaisse nulle part, puisque le produit
   * continuerait de fonctionner.
   */
  it("ne retire jamais un avis de la moyenne, même commentaire retiré", async () => {
    const { org, annonce } = await partenaireNeuf("Moyenne Intacte");

    await deposer(org, annonce, 5);
    const mauvais = await deposer(org, annonce, 1);

    const notes = async () =>
      (
        await db.query("select rating_avg, rating_count from listings where id = $1", [annonce])
      ).rows[0];

    const avant = await notes();
    expect(Number(avant.rating_avg)).toBe(3);
    expect(avant.rating_count).toBe(2);

    await actingAs(db, ADMIN, async () =>
      db.query("select redact_review_body($1, 'Propos injurieux envers un salarié')", [mauvais]),
    );

    const apres = await notes();
    expect(Number(apres.rating_avg)).toBe(3);
    expect(apres.rating_count).toBe(2);

    // Et le profil du partenaire suit la même règle.
    const { rows: p } = await db.query(
      "select rating_avg, rating_count from partner_profiles where org_id = $1",
      [org],
    );
    expect(Number(p[0].rating_avg)).toBe(3);
    expect(p[0].rating_count).toBe(2);
  });

  it("garde l'avis lisible, avec le motif à la place du texte", async () => {
    const { org, annonce } = await partenaireNeuf("Motif Public");
    const avis = await deposer(org, annonce, 1);

    await actingAs(db, ADMIN, async () =>
      db.query("select redact_review_body($1, 'Numéro de téléphone publié dans le texte')", [
        avis,
      ]),
    );

    // Lu par un **visiteur**, sans aucune session : l'avis reste public, et le
    // motif avec lui. C'est ce qui distingue une modération assumée d'un
    // effacement.
    const { rows } = await actingAs(db, null, async () =>
      db.query(
        "select rating, body_redacted_at, redaction_reason from reviews where id = $1",
        [avis],
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(1);
    expect(rows[0].body_redacted_at).not.toBeNull();
    expect(rows[0].redaction_reason).toMatch(/téléphone/);
  });

  it("rétablit le commentaire sans toucher à la note", async () => {
    const { org, annonce } = await partenaireNeuf("Retablir Texte");
    const avis = await deposer(org, annonce, 2);

    await actingAs(db, ADMIN, async () => {
      await db.query("select redact_review_body($1, 'Retiré par erreur de manipulation')", [avis]);
      await db.query("select restore_review_body($1)", [avis]);
    });

    const { rows } = await db.query(
      "select body_redacted_at, redaction_reason from reviews where id = $1",
      [avis],
    );
    expect(rows[0].body_redacted_at).toBeNull();
    expect(rows[0].redaction_reason).toBeNull();

    const { rows: n } = await db.query("select rating_count from listings where id = $1", [
      annonce,
    ]);
    expect(n[0].rating_count).toBe(1);
  });

  it("n'offre plus aucun moyen de retirer un avis", async () => {
    // ⚠️ `hide_review` et `reinstate_review` ont été **supprimées**, pas
    // laissées en coquilles : un appel oublié quelque part doit échouer, pas
    // réussir sans rien faire.
    for (const appel of [
      "select hide_review('11111111-1111-4111-8111-111111111111', 'un motif assez long ici')",
      "select reinstate_review('11111111-1111-4111-8111-111111111111')",
    ]) {
      await expect(db.query(appel)).rejects.toThrow(/does not exist/i);
    }
  });
});

describe("droit de réponse", () => {
  let avis: string;

  beforeAll(async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        `insert into reviews (order_id, rating, body)
         values ($1, 2, 'Retard de deux heures.') returning id`,
        [commande],
      ),
    );
    avis = rows[0].id as string;
  });

  it("refuse la réponse d'un concurrent", async () => {
    await actingAs(db, BOB, async () => {
      await expect(
        db.query("select reply_to_review($1, 'Avis manifestement faux et malveillant.')", [avis]),
      ).rejects.toThrow(/prestataire concerné/i);
    });
  });

  it("refuse la réponse du client lui-même", async () => {
    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("select reply_to_review($1, 'Je confirme mon propre avis ici.')", [avis]),
      ).rejects.toThrow(/prestataire concerné/i);
    });
  });

  it("laisse le prestataire répondre, une seule fois", async () => {
    // Un échange se poursuit dans la messagerie, pas sous un avis public :
    // sinon le dernier mot revient toujours au prestataire.
    await actingAs(db, ALICE, async () =>
      db.query("select reply_to_review($1, 'Vous avez raison, notre camion est tombé en panne.')", [
        avis,
      ]),
    );

    const { rows } = await db.query("select reply, replied_at from reviews where id = $1", [avis]);
    expect(rows[0].reply).toMatch(/camion/);
    expect(rows[0].replied_at).not.toBeNull();

    await actingAs(db, ALICE, async () => {
      await expect(
        db.query("select reply_to_review($1, 'Et nous ajoutons un second argument.')", [avis]),
      ).rejects.toThrow(/déjà répondu/i);
    });
  });

  it("refuse à l'auteur de réécrire son avis après la réponse", async () => {
    // Sinon la réponse publique devient incompréhensible : le prestataire
    // aurait répondu à un texte que plus personne ne peut lire.
    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("update reviews set rating = 5, body = 'Tout était parfait.' where id = $1", [
          avis,
        ]),
      ).rejects.toThrow(/déjà répondu/i);
    });
  });

  it("laisse l'auteur se corriger tant que personne n'a répondu", async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        `insert into reviews (order_id, rating, body)
         values ($1, 3, 'Correct dans l ensemble.') returning id`,
        [commande],
      ),
    );

    const { affectedRows } = await actingAs(db, CLARA, async () =>
      db.query("update reviews set rating = 4 where id = $1", [rows[0].id]),
    );

    expect(affectedRows).toBe(1);
  });

  it("refuse à l'auteur d'écrire la réponse du prestataire", async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgAlice, annonce: annonceAlice });
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query("insert into reviews (order_id, rating) values ($1, 1) returning id", [commande]),
    );

    await actingAs(db, CLARA, async () => {
      await expect(
        db.query("update reviews set reply = 'Nous nous excusons platement.' where id = $1", [
          rows[0].id,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("lecture", () => {
  let modere: string;

  beforeAll(async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgBob, annonce: null });
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        `insert into reviews (order_id, rating, body)
         values ($1, 1, 'Texte dont le commentaire sera retiré.') returning id`,
        [commande],
      ),
    );
    modere = rows[0].id as string;

    await actingAs(db, ADMIN, async () =>
      db.query("select redact_review_body($1, 'Propos diffamatoires nominatifs')", [modere]),
    );
  });

  it("montre tous les avis à un visiteur non connecté", async () => {
    // ⚠️ **Il n'existe plus d'avis invisible.** La politique est devenue
    // `using (true)` : un avis dont le commentaire a été retiré se lit comme
    // les autres, étoiles comprises.
    const { rows } = await actingAs(db, null, async () =>
      db.query("select id from reviews"),
    );

    expect(rows.length).toBeGreaterThan(0);
  });

  it("montre l'avis modéré au public, motif compris", async () => {
    const { rows } = await actingAs(db, null, async () =>
      db.query(
        "select rating, body_redacted_at, redaction_reason from reviews where id = $1",
        [modere],
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(1);
    expect(rows[0].redaction_reason).toMatch(/diffamatoires/);
  });

  it("garde le nom du modérateur hors de toute lecture directe", async () => {
    // ⚠️ Contrôle **par le nom de la colonne**, pas par `select *` : une
    // colonne retirée du grant ne sort plus d'une étoile, et un contrôle écrit
    // ainsi passerait au vert pour la mauvaise raison.
    //
    // Le **motif** est public depuis la migration 0050 — c'est lui qui rend la
    // modération assumée. C'est `redacted_by`, qui a tranché, qui reste fermé.
    for (const qui of [CLARA, BOB, ADMIN]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query("select redacted_by from reviews where id = $1", [modere]),
        ).rejects.toThrow(/permission denied/i);
      });
    }
  });

  it("rend le texte d'origine à l'administration par admin_reviews()", async () => {
    // Le texte retiré reste lisible par l'équipe : c'est lui qu'on relira si
    // l'auteur réclame.
    const { rows } = await actingAs(db, ADMIN, async () =>
      db.query("select body, redaction_reason from admin_reviews('moderes') where id = $1", [
        modere,
      ]),
    );

    expect(rows[0].body).toMatch(/commentaire sera retiré/);
    expect(rows[0].redaction_reason).toMatch(/diffamatoires/);
  });

  it("ne rend rien par admin_reviews() à qui n'est pas administrateur", async () => {
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query("select id from admin_reviews('tous')"),
    );

    expect(rows).toHaveLength(0);
  });

  it("refuse à quiconque de retirer un commentaire sans être administrateur", async () => {
    for (const qui of [CLARA, ALICE, BOB]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query("select redact_review_body($1, 'Cet avis ne me convient pas du tout')", [
            modere,
          ]),
        ).rejects.toThrow(/équipe ÉniEvent/i);
      });
    }
  });
});

describe("signature anonymisée", () => {
  it("retire le nom d'un compte supprimé", async () => {
    // `delete_my_account` anonymise dès qu'une histoire existe, et un avis en
    // est une. Sans ce déclencheur, « Didier S. » continuerait de signer après
    // qu'il a demandé à être oublié.
    const users = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'partant@exemple.bj', '{"account_type":"particulier"}')
       returning id`,
    );
    const partant = users.rows[0].id as string;
    await db.query("update profiles set full_name = 'Didier Soglo' where id = $1", [partant]);

    const commande = await commandeTerminee({
      client: partant,
      org: orgAlice,
      annonce: annonceAlice,
    });
    const { rows } = await actingAs(db, partant, async () =>
      db.query("insert into reviews (order_id, rating) values ($1, 4) returning id, author_label", [
        commande,
      ]),
    );

    expect(rows[0].author_label).toBe("Didier S.");

    await db.query("update profiles set deleted_at = now() where id = $1", [partant]);

    const { rows: apres } = await db.query("select author_label from reviews where id = $1", [
      rows[0].id,
    ]);
    expect(apres[0].author_label).toBe("Un client");
  });

  it("signe « Un client » un profil sans nom", async () => {
    // Pas de vide, pas de « undefined » : la vérité, qui est qu'on ne connaît
    // pas son nom.
    const users = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'sansnom@exemple.bj', '{"account_type":"particulier"}')
       returning id`,
    );
    const sansNom = users.rows[0].id as string;

    const commande = await commandeTerminee({
      client: sansNom,
      org: orgAlice,
      annonce: annonceAlice,
    });
    const { rows } = await actingAs(db, sansNom, async () =>
      db.query("insert into reviews (order_id, rating) values ($1, 3) returning author_label", [
        commande,
      ]),
    );

    expect(rows[0].author_label).toBe("Un client");
  });
});

describe("notifications", () => {
  it("prévient le prestataire d'un avis reçu, et le client d'une réponse", async () => {
    // Un partenaire ne consulte pas /pro/avis de lui-même (§8 du guide).
    const { org, annonce } = await partenaireNeuf("Notif Test");
    await db.query("update organizations set billing_email = $1 where id = $2", [
      "notif@test.bj",
      org,
    ]);
    await db.query(
      "insert into organization_members (org_id, org_type, user_id, role) values ($1, 'partner', $2, 'owner')",
      [org, ALICE],
    );

    const avis = await deposer(org, annonce, 2);

    const { rows: recu } = await db.query(
      "select recipient, payload from notifications where kind = 'review.received' and ref_id = $1",
      [avis],
    );
    expect(recu).toHaveLength(1);
    expect(recu[0].recipient).toBe("notif@test.bj");
    expect((recu[0].payload as { rating: number }).rating).toBe(2);

    await actingAs(db, ALICE, async () =>
      db.query("select reply_to_review($1, 'Merci de votre retour, nous corrigeons cela.')", [avis]),
    );

    const { rows: reponse } = await db.query(
      "select recipient from notifications where kind = 'review.replied' and ref_id = $1",
      [avis],
    );
    expect(reponse).toHaveLength(1);
    expect(reponse[0].recipient).toBe("clara@exemple.bj");
  });
});

/**
 * Crée un partenaire complet — organisation, profil, annonce, et **son
 * dirigeant**, avec son propre compte.
 *
 * Un compte par scénario : les plafonds de débit se comptent par personne, et
 * deux tests qui partagent un signaleur finiraient par se gêner sans que la
 * cause soit lisible.
 */
async function partenaireAvecPatron(
  nom: string,
): Promise<{ org: string; annonce: string; patron: string }> {
  const { org, annonce } = await partenaireNeuf(nom);

  const users = await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, '{"account_type":"partenaire"}') returning id`,
    [`${nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@patron.bj`],
  );
  const patron = users.rows[0].id as string;

  await db.query(
    "insert into organization_members (org_id, org_type, user_id, role) values ($1, 'partner', $2, 'owner')",
    [org, patron],
  );

  return { org, annonce, patron };
}

/**
 * Signalements.
 *
 * ⚠️ **La décision du 11 octobre 2026 a retourné ce bloc entier.** Un
 * signalement ne retire plus rien : il est redevenu ce qu'il aurait dû être, un
 * signal adressé à l'équipe. Retirer un mauvais avis est un signe de méfiance
 * envers la plateforme — une vitrine qui n'affiche que des éloges ne rassure
 * personne.
 *
 * Ce que ces contrôles gardent est donc l'**inverse** de ce qu'ils gardaient :
 * que signaler **ne fasse rien disparaître**, quel que soit le signaleur, et
 * que la note du prestataire ne bouge pas d'un dixième.
 */
describe("signalement d'un avis", () => {
  it("ne retire rien, même signalé par le prestataire concerné", async () => {
    // ⚠️ **Le contrôle qui porte toute la décision.** C'était le comportement
    // voulu la veille, et c'est devenu le défaut à interdire : si cette
    // assertion tombe, un partenaire efface ses mauvais avis et la plateforme
    // perd exactement ce que les avis devaient lui apporter.
    const { org, annonce, patron } = await partenaireAvecPatron("Rien Retire");
    const avis = await deposer(org, annonce, 1, "Prestation très en dessous de ce qui était promis.");

    const { rows: ref } = await actingAs(db, patron, async () =>
      db.query("select open_report('review', $1, 'Nous contestons formellement cet avis') as ref", [
        avis,
      ]),
    );

    expect(ref[0].ref).toMatch(/^SIG-/);

    const { rows } = await db.query(
      "select body, body_redacted_at from reviews where id = $1",
      [avis],
    );
    expect(rows[0].body_redacted_at).toBeNull();
    expect(rows[0].body).not.toBeNull();

    // Et la note n'a pas bougé d'un dixième.
    const { rows: note } = await db.query(
      "select rating_avg, rating_count from listings where id = $1",
      [annonce],
    );
    expect(Number(note[0].rating_avg)).toBe(1);
    expect(note[0].rating_count).toBe(1);
  });

  it("ne retire rien non plus quand un tiers signale", async () => {
    const { org, annonce } = await partenaireAvecPatron("Tiers Signale");
    const avis = await deposer(org, annonce, 5);

    await actingAs(db, CLARA, async () =>
      db.query("select open_report('review', $1, 'Cet avis me paraît beaucoup trop élogieux')", [
        avis,
      ]),
    );

    const { rows } = await db.query("select body_redacted_at from reviews where id = $1", [avis]);
    expect(rows[0].body_redacted_at).toBeNull();

    const { rows: s } = await db.query("select status from reports where review_id = $1", [avis]);
    expect(s[0].status).toBe("open");
  });

  it("l'avis reste public pendant tout l'examen", async () => {
    // Le défaut d'hier : l'avis disparaissait le temps du traitement, et la
    // note de son prestataire était fausse pendant ce temps-là.
    const { org, annonce, patron } = await partenaireAvecPatron("Public Pendant");
    const avis = await deposer(org, annonce, 2, "Texte qui reste lisible pendant tout l examen.");

    await actingAs(db, patron, async () =>
      db.query("select open_report('review', $1, 'Signalement pendant lequel on vérifie')", [avis]),
    );

    const { rows } = await actingAs(db, null, async () =>
      db.query("select id, body from reviews where id = $1", [avis]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].body).toMatch(/pendant tout l examen/);
  });

  it("refuse de signaler deux fois le même contenu", async () => {
    // Resignaler n'ajoute pas de poids, et laisserait croire à un nombre de
    // plaintes qui n'existe pas.
    const { org, annonce, patron } = await partenaireAvecPatron("Double Signale");
    const avis = await deposer(org, annonce, 2);

    await actingAs(db, patron, async () => {
      await db.query("select open_report('review', $1, 'Avis manifestement mensonger ici')", [avis]);

      await expect(
        db.query("select open_report('review', $1, 'Je le signale une seconde fois')", [avis]),
      ).rejects.toThrow(/déjà signalé/i);
    });
  });

  it("refuse un motif trop court pour être exploitable", async () => {
    const { org, annonce, patron } = await partenaireAvecPatron("Motif Court");
    const avis = await deposer(org, annonce, 3);

    await actingAs(db, patron, async () => {
      await expect(db.query("select open_report('review', $1, 'faux')", [avis])).rejects.toThrow(
        /15 caractères/i,
      );
    });
  });

  it("refuse un signalement à un visiteur non connecté", async () => {
    const { org, annonce } = await partenaireAvecPatron("Anonyme Signale");
    const avis = await deposer(org, annonce, 4);

    await actingAs(db, null, async () => {
      await expect(
        db.query("select open_report('review', $1, 'Signalement sans aucun compte')", [avis]),
      ).rejects.toThrow();
    });
  });

  it("trancher un signalement ne touche pas à l'avis", async () => {
    // ⚠️ Les deux issues consignent une décision, et c'est tout. Retirer un
    // commentaire illicite est un **second geste**, explicite : les enchaîner
    // ferait du signalement un bouton de suppression.
    const { org, annonce, patron } = await partenaireAvecPatron("Trancher Neutre");
    const avis = await deposer(org, annonce, 1, "Texte que trancher le signalement ne doit pas effacer.");

    await actingAs(db, patron, async () =>
      db.query("select open_report('review', $1, 'Un motif suffisamment long ici')", [avis]),
    );
    const { rows: s } = await db.query("select id from reports where review_id = $1", [avis]);

    await actingAs(db, ADMIN, async () =>
      db.query("select resolve_report($1, 'upheld', 'Signalement fondé, contenu problématique')", [
        s[0].id,
      ]),
    );

    // « Retenu » **ne retire rien** : c'est la différence avec la veille.
    const { rows } = await db.query(
      "select body, body_redacted_at from reviews where id = $1",
      [avis],
    );
    expect(rows[0].body_redacted_at).toBeNull();
    expect(rows[0].body).not.toBeNull();

    const { rows: r } = await db.query("select status, resolution from reports where id = $1", [
      s[0].id,
    ]);
    expect(r[0].status).toBe("upheld");
    expect(r[0].resolution).toMatch(/fondé/);
  });

  it("refuse de trancher deux fois le même signalement", async () => {
    const { org, annonce, patron } = await partenaireAvecPatron("Deux Fois");
    const avis = await deposer(org, annonce, 2);

    await actingAs(db, patron, async () =>
      db.query("select open_report('review', $1, 'Un motif suffisamment long ici')", [avis]),
    );
    const { rows: s } = await db.query("select id from reports where review_id = $1", [avis]);

    await actingAs(db, ADMIN, async () => {
      await db.query("select resolve_report($1, 'dismissed', 'Rien à reprocher à cet avis là')", [
        s[0].id,
      ]);

      await expect(
        db.query("select resolve_report($1, 'upheld', 'Finalement nous changeons d avis')", [
          s[0].id,
        ]),
      ).rejects.toThrow(/déjà été tranché/i);
    });
  });

  it("refuse de trancher à qui n'est pas administrateur", async () => {
    const { org, annonce, patron } = await partenaireAvecPatron("Pas Admin");
    const avis = await deposer(org, annonce, 2);

    await actingAs(db, patron, async () =>
      db.query("select open_report('review', $1, 'Un motif suffisamment long ici')", [avis]),
    );
    const { rows: s } = await db.query("select id from reports where review_id = $1", [avis]);

    for (const qui of [patron, CLARA]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query("select resolve_report($1, 'dismissed', 'Je me tranche mon propre cas')", [
            s[0].id,
          ]),
        ).rejects.toThrow(/équipe ÉniEvent/i);
      });
    }
  });

  it("laisse le prestataire répondre à un avis dont le texte a été retiré", async () => {
    // Le cas où il en a le plus besoin : son client a été modéré, et il veut
    // dire publiquement ce qui s'est passé. La migration 0048 le refusait.
    const { org, annonce, patron } = await partenaireAvecPatron("Repondre Modere");
    const avis = await deposer(org, annonce, 1);

    await actingAs(db, ADMIN, async () =>
      db.query("select redact_review_body($1, 'Insultes nominatives envers un salarié')", [avis]),
    );

    await actingAs(db, patron, async () =>
      db.query("select reply_to_review($1, 'Nous regrettons cet échange et voici notre version.')", [
        avis,
      ]),
    );

    const { rows } = await db.query("select reply from reviews where id = $1", [avis]);
    expect(rows[0].reply).toMatch(/notre version/);
  });

  it("cache un signalement à tout le monde sauf son auteur et l'équipe", async () => {
    // ⚠️ **Un signalement ne se montre pas à sa cible.** Un client qui signale
    // une annonce ne doit pas être identifiable par le partenaire qu'il
    // signale, sans quoi personne ne signalerait plus rien.
    const { annonce, patron } = await partenaireAvecPatron("Discretion");

    await actingAs(db, CLARA, async () =>
      db.query("select open_report('listing', $1, 'Les photos ne correspondent pas au lieu')", [
        annonce,
      ]),
    );

    const vu = async (qui: string) =>
      (
        await actingAs(db, qui, async () =>
          db.query("select id from reports where listing_id = $1", [annonce]),
        )
      ).rows.length;

    expect(await vu(CLARA)).toBe(1); // son auteur
    expect(await vu(ADMIN)).toBe(1); // l'équipe
    expect(await vu(patron)).toBe(0); // la cible : rien

    // Un visiteur n'a aucun droit sur la table : il se heurte au privilège,
    // pas à la RLS. Un refus franc, pas une liste vide.
    await actingAs(db, null, async () => {
      await expect(db.query("select id from reports")).rejects.toThrow(/permission denied/i);
    });
  });

  it("ne retire jamais une annonce automatiquement", async () => {
    // Une annonce validée reste en ligne jusqu'à décision : la retirer sur
    // simple signalement couperait les réservations d'un partenaire sur la
    // parole d'un inconnu.
    const { annonce } = await partenaireAvecPatron("Annonce Signalee");

    await actingAs(db, CLARA, async () =>
      db.query("select open_report('listing', $1, 'Je trouve cette annonce trompeuse')", [annonce]),
    );

    const { rows } = await db.query("select status, is_paused from listings where id = $1", [
      annonce,
    ]);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].is_paused).toBe(false);
  });

  it("plafonne les signalements sans gêner un usage normal", async () => {
    // ⚠️ Les **deux** bords : un plafond trop serré est une panne, pas une
    // protection (leçon de la migration 0045). Ce plafond est le seul des trois
    // bornes de la 0049 qui survive — il borne un volume d'envois, ce qui n'a
    // rien à voir avec le retrait.
    const users = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'rafale@exemple.bj', '{"account_type":"particulier"}')
       returning id`,
    );
    const rafale = users.rows[0].id as string;

    const { rows: cats } = await db.query("select id from categories where slug = 'traiteur'");
    const cibles: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { rows } = await db.query(
        `insert into listings (org_id, category_id, kind, title, slug, city, status, cancellation_policy_id)
         values ($1, $2, 'service', $3, $4, 'Cotonou', 'approved', $5) returning id`,
        [orgAlice, cats[0].id, `Cible ${i}`, `cible-plafond-${i}`, bareme],
      );
      cibles.push(rows[0].id as string);
    }

    await actingAs(db, rafale, async () => {
      // Cinq passent : c'est l'usage normal de quelqu'un qui fait le tour.
      for (let i = 0; i < 5; i += 1) {
        await db.query("select open_report('listing', $1, 'Cette annonce me paraît trompeuse')", [
          cibles[i],
        ]);
      }

      await expect(
        db.query("select open_report('listing', $1, 'Et celle-ci aussi me paraît trompeuse')", [
          cibles[5],
        ]),
      ).rejects.toThrow(/dans une heure/i);
    });
  });
});

/**
 * Un client neuf, avec son propre compte.
 *
 * ⚠️ **Écrit après coup, et la raison vaut d'être notée** : la première version
 * de ces tests faisait tout ouvrir par la même cliente, et le sixième litige
 * était refusé — par le plafond de débit de la migration 0049, qui faisait
 * exactement son travail. Un plafond se compte par personne ; concentrer dix
 * scénarios sur un seul compte ne ressemble à rien de réel.
 */
async function clientNeuf(nom: string): Promise<string> {
  const { rows } = await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, '{"account_type":"particulier"}') returning id`,
    [`${nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@client.bj`],
  );

  const id = rows[0].id as string;
  await db.query("update profiles set full_name = $1 where id = $2", [nom, id]);

  return id;
}

/**
 * Litiges.
 *
 * Un litige porte sur une **réservation payée**. C'est la ligne qui le sépare
 * d'une réclamation : sans argent déplacé, le recours est l'annulation, qui
 * applique un barème connu.
 */
describe("litiges", () => {
  it("laisse le client ouvrir un litige sur une réservation réglée", async () => {
    const client = await clientNeuf("Retard Traiteur");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    const { rows } = await actingAs(db, client, async () =>
      db.query(
        "select open_dispute($1, 'Le traiteur est arrivé avec deux heures de retard et il manquait deux plats.') as ref",
        [commande],
      ),
    );

    expect(rows[0].ref).toMatch(/^LIT-/);

    const { rows: l } = await db.query("select side, status from disputes where order_id = $1", [
      commande,
    ]);
    expect(l[0].side).toBe("client");
    expect(l[0].status).toBe("open");
  });

  it("laisse le prestataire ouvrir le sien, et le range du bon côté", async () => {
    // `side` est figé à l'ouverture : un membre peut quitter l'organisation
    // ensuite, et le litige doit rester lisible du bon côté.
    const client = await clientNeuf("Solde Impaye");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, ALICE, async () =>
      db.query(
        "select open_dispute($1, 'Le client a refusé de régler le solde en invoquant un motif que nous contestons.')",
        [commande],
      ),
    );

    const { rows } = await db.query("select side from disputes where order_id = $1", [commande]);
    expect(rows[0].side).toBe("partner");
  });

  it("refuse à un tiers d'ouvrir un litige", async () => {
    const client = await clientNeuf("Tiers Litige");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, BOB, async () => {
      await expect(
        db.query(
          "select open_dispute($1, 'Je conteste une réservation qui ne me concerne absolument pas.')",
          [commande],
        ),
      ).rejects.toThrow(/deux parties/i);
    });
  });

  it("refuse tant qu'aucun règlement n'a été encaissé", async () => {
    // Sans argent déplacé, le recours est l'annulation — qui applique un
    // barème connu et rend ce qui est dû. Ouvrir un litige donnerait à
    // arbitrer un désaccord sans objet, et ferait de `/admin/litiges` une
    // seconde boîte de support.
    const client = await clientNeuf("Rien Regle");
    const commande = await commandeTerminee({
      client,
      org: orgAlice,
      annonce: annonceAlice,
      reglee: false,
    });

    await actingAs(db, client, async () => {
      await expect(
        db.query(
          "select open_dispute($1, 'Je conteste cette réservation que je n ai pas encore réglée du tout.')",
          [commande],
        ),
      ).rejects.toThrow(/encaissé/i);
    });
  });

  it("refuse un récit trop court pour être arbitré", async () => {
    const client = await clientNeuf("Recit Court");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, client, async () => {
      await expect(db.query("select open_dispute($1, 'Pas content')", [commande])).rejects.toThrow(
        /30 caractères/i,
      );
    });
  });

  it("refuse un second litige ouvert sur la même réservation", async () => {
    // Deux plaintes simultanées feraient deux décisions possibles, donc une
    // contradiction. L'index est **partiel** : une fois le litige clos, la
    // réservation redevient contestable.
    const client = await clientNeuf("Second Litige");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, client, async () =>
      db.query(
        "select open_dispute($1, 'Premier litige sur cette réservation, avec un récit assez long.')",
        [commande],
      ),
    );

    await actingAs(db, ALICE, async () => {
      await expect(
        db.query(
          "select open_dispute($1, 'Et nous en ouvrons un second du côté du prestataire cette fois.')",
          [commande],
        ),
      ).rejects.toThrow(/déjà ouvert/i);
    });
  });

  it("montre le litige aux deux parties, et à personne d'autre", async () => {
    // On ne peut pas demander à quelqu'un de se défendre d'un reproche qu'il
    // ne lit pas — contrairement à un signalement, qui reste discret parce
    // qu'il n'a pas deux parties mais une cible.
    const client = await clientNeuf("Visibilite Litige");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    await actingAs(db, client, async () =>
      db.query(
        "select open_dispute($1, 'Litige dont la visibilité est exactement ce que ce test vérifie.')",
        [commande],
      ),
    );

    const vu = async (qui: string) =>
      (
        await actingAs(db, qui, async () =>
          db.query("select id from disputes where order_id = $1", [commande]),
        )
      ).rows.length;

    expect(await vu(client)).toBe(1); // le client
    expect(await vu(ALICE)).toBe(1); // le prestataire mis en cause
    expect(await vu(ADMIN)).toBe(1);
    expect(await vu(BOB)).toBe(0); // un concurrent

    // Un visiteur n'a aucun droit sur la table : il se heurte au privilège,
    // pas à la RLS. Un refus franc, pas une liste vide.
    await actingAs(db, null, async () => {
      await expect(db.query("select id from disputes")).rejects.toThrow(/permission denied/i);
    });
  });

  it("laisse celui qui l'a ouvert le retirer, et lui seul", async () => {
    // Les deux parties s'arrangent souvent entre elles, et il faut une sortie
    // qui ne soit pas une décision de la plateforme.
    const client = await clientNeuf("Retrait Litige");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    await actingAs(db, client, async () =>
      db.query(
        "select open_dispute($1, 'Litige que la cliente retirera elle-même après arrangement.')",
        [commande],
      ),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    await actingAs(db, ALICE, async () => {
      await expect(db.query("select withdraw_dispute($1)", [l[0].id])).rejects.toThrow(
        /partie qui a ouvert/i,
      );
    });

    await actingAs(db, client, async () =>
      db.query("select withdraw_dispute($1, 'Nous nous sommes arrangés directement.')", [l[0].id]),
    );

    const { rows } = await db.query("select status, resolved_at from disputes where id = $1", [
      l[0].id,
    ]);
    expect(rows[0].status).toBe("withdrawn");
    expect(rows[0].resolved_at).not.toBeNull();
  });

  it("exige une décision écrite pour trancher", async () => {
    // C'est elle que lira la partie qui perd, et qu'on relira en cas de
    // contestation. « En examen » n'est pas une décision : elle n'exige donc
    // pas de motif.
    const client = await clientNeuf("Decision Ecrite");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    await actingAs(db, client, async () =>
      db.query("select open_dispute($1, 'Litige qui servira à éprouver la décision écrite.')", [
        commande,
      ]),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    await actingAs(db, ADMIN, async () => {
      await expect(
        db.query("select resolve_dispute($1, 'resolved_partner', 'Non')", [l[0].id]),
      ).rejects.toThrow(/30 caractères/i);

      await db.query("select resolve_dispute($1, 'under_review', null)", [l[0].id]);
    });

    const { rows } = await db.query("select status, resolved_at from disputes where id = $1", [
      l[0].id,
    ]);
    expect(rows[0].status).toBe("under_review");
    expect(rows[0].resolved_at).toBeNull();
  });

  it("refuse de rattacher le remboursement d'une autre réservation", async () => {
    // ⚠️ Un identifiant copié de travers lierait un litige au remboursement de
    // quelqu'un d'autre, et le journal mentirait.
    const client = await clientNeuf("Mauvais Remboursement");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    const autre = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, client, async () =>
      db.query(
        "select open_dispute($1, 'Litige servant à éprouver le rattachement du remboursement.')",
        [commande],
      ),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    const { rows: r } = await db.query(
      `insert into refunds (order_id, client_id, org_id, amount, refund_percent)
       values ($1, $2, $3, 100000, 100) returning id`,
      [autre, client, orgAlice],
    );

    await actingAs(db, ADMIN, async () => {
      await expect(
        db.query(
          "select resolve_dispute($1, 'resolved_refund', 'Le client est remboursé, la prestation n a pas eu lieu.', $2)",
          [l[0].id, r[0].id],
        ),
      ).rejects.toThrow(/ne porte pas sur la réservation/i);
    });
  });

  it("accepte le remboursement de la bonne réservation", async () => {
    // Le contre-test : trop serré, la vérification serait une panne.
    const client = await clientNeuf("Bon Remboursement");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });

    await actingAs(db, client, async () =>
      db.query("select open_dispute($1, 'Litige tranché en faveur du client, remboursement joint.')", [
        commande,
      ]),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    const { rows: r } = await db.query(
      `insert into refunds (order_id, client_id, org_id, amount, refund_percent)
       values ($1, $2, $3, 600000, 100) returning id`,
      [commande, client, orgAlice],
    );

    await actingAs(db, ADMIN, async () =>
      db.query(
        "select resolve_dispute($1, 'resolved_refund', 'Prestation non rendue : le client est remboursé intégralement.', $2)",
        [l[0].id, r[0].id],
      ),
    );

    const { rows } = await db.query(
      "select status, refund_id, resolution from disputes where id = $1",
      [l[0].id],
    );
    expect(rows[0].status).toBe("resolved_refund");
    expect(rows[0].refund_id).toBe(r[0].id);
    expect(rows[0].resolution).toMatch(/remboursé intégralement/);
  });

  it("refuse de trancher à qui n'est pas administrateur", async () => {
    const client = await clientNeuf("Auto Arbitrage");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    await actingAs(db, client, async () =>
      db.query("select open_dispute($1, 'Litige que la cliente va tenter de trancher elle-même.')", [
        commande,
      ]),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    for (const qui of [client, ALICE]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query(
            "select resolve_dispute($1, 'resolved_refund', 'Je tranche en ma propre faveur, évidemment.')",
            [l[0].id],
          ),
        ).rejects.toThrow(/équipe ÉniEvent/i);
      });
    }
  });

  it("plafonne les litiges sans gêner un usage normal", async () => {
    // ⚠️ Les **deux** bords. Et c'est ce plafond qui a refusé le sixième litige
    // de la première version de ces tests : un plafond se compte par personne,
    // et dix scénarios sur un seul compte ne ressemblent à rien de réel.
    const client = await clientNeuf("Rafale Litiges");

    const commandes: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      commandes.push(await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice }));
    }

    await actingAs(db, client, async () => {
      for (let i = 0; i < 5; i += 1) {
        await db.query(
          "select open_dispute($1, 'Contestation légitime sur cette réservation précise là.')",
          [commandes[i]],
        );
      }

      await expect(
        db.query(
          "select open_dispute($1, 'Et une sixième contestation dans la même journée aussi.')",
          [commandes[5]],
        ),
      ).rejects.toThrow(/demain/i);
    });
  });

  it("prévient l'autre partie, et l'équipe", async () => {
    // Celle qui ouvre le sait déjà. Celle qui est mise en cause doit pouvoir se
    // défendre : apprendre par surprise qu'une décision a été prise sans elle
    // serait le pire parcours possible.
    await db.query(
      `insert into app.runtime_config (key, value) values ('support_email', 'support@enievent.bj')
       on conflict (key) do update set value = excluded.value`,
    );
    await db.query("update organizations set billing_email = $1 where id = $2", [
      "litige@saveurs.bj",
      orgAlice,
    ]);

    const client = await clientNeuf("Notif Litige");
    const commande = await commandeTerminee({ client, org: orgAlice, annonce: annonceAlice });
    await actingAs(db, client, async () =>
      db.query("select open_dispute($1, 'Litige dont les notifications sont le sujet de ce test.')", [
        commande,
      ]),
    );
    const { rows: l } = await db.query("select id from disputes where order_id = $1", [commande]);

    const { rows } = await db.query(
      "select recipient, payload from notifications where kind = 'dispute.opened' and ref_id = $1",
      [l[0].id],
    );

    const destinataires = rows.map((r) => r.recipient);
    expect(destinataires).toContain("litige@saveurs.bj");
    expect(destinataires).toContain("support@enievent.bj");

    // Le client, qui l'a ouvert, n'est pas destinataire.
    expect(destinataires).not.toContain("notif-litige@client.bj");

    const versPartenaire = rows.find((r) => r.recipient === "litige@saveurs.bj");
    expect((versPartenaire?.payload as { pour: string }).pour).toBe("partner");
  });
});
