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
async function deposer(org: string, annonce: string | null, note: number): Promise<string> {
  const commande = await commandeTerminee({ client: CLARA, org, annonce });
  const { rows } = await actingAs(db, CLARA, async () =>
    db.query("insert into reviews (order_id, rating) values ($1, $2) returning id", [
      commande,
      note,
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

  it("retire des moyennes un avis masqué, et le rend au rétablissement", async () => {
    const { org, annonce } = await partenaireNeuf("Masque Test");

    await deposer(org, annonce, 5);
    const mauvais = await deposer(org, annonce, 1);

    const moyenne = async () =>
      Number(
        (await db.query("select rating_avg from listings where id = $1", [annonce])).rows[0]
          .rating_avg,
      );

    expect(await moyenne()).toBe(3);

    await actingAs(db, ADMIN, async () =>
      db.query("select hide_review($1, 'Propos injurieux envers le personnel')", [mauvais]),
    );
    expect(await moyenne()).toBe(5);

    await actingAs(db, ADMIN, async () => db.query("select reinstate_review($1)", [mauvais]));
    expect(await moyenne()).toBe(3);
  });

  it("revient à « pas encore de note » quand il ne reste aucun avis", async () => {
    // ⚠️ « Pas encore de donnée » et « zéro » ne s'écrivent pas pareil (§5 du
    // guide). Une annonce dont le seul avis a été masqué doit afficher « — »,
    // pas « 0 sur 5 » — et c'est `null` qui porte cette différence.
    const { org, annonce } = await partenaireNeuf("Vide Test");

    const seul = await deposer(org, annonce, 4);
    await actingAs(db, ADMIN, async () =>
      db.query("select hide_review($1, 'Avis déposé par erreur sur la mauvaise fiche')", [seul]),
    );

    const { rows } = await db.query(
      "select rating_avg, rating_count from listings where id = $1",
      [annonce],
    );
    expect(rows[0].rating_avg).toBeNull();
    expect(rows[0].rating_count).toBe(0);
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
  let masque: string;

  beforeAll(async () => {
    const commande = await commandeTerminee({ client: CLARA, org: orgBob, annonce: null });
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query(
        `insert into reviews (order_id, rating, body)
         values ($1, 1, 'Texte à masquer pour le test.') returning id`,
        [commande],
      ),
    );
    masque = rows[0].id as string;

    await actingAs(db, ADMIN, async () =>
      db.query("select hide_review($1, 'Signalement retenu : propos diffamatoires')", [masque]),
    );
  });

  it("montre les avis publiés à un visiteur non connecté", async () => {
    const { rows } = await actingAs(db, null, async () =>
      db.query("select id from reviews where hidden_at is null"),
    );

    expect(rows.length).toBeGreaterThan(0);
  });

  it("cache un avis masqué au public", async () => {
    const { rows } = await actingAs(db, null, async () =>
      db.query("select id from reviews where id = $1", [masque]),
    );

    expect(rows).toHaveLength(0);
  });

  it("le laisse lisible par son auteur et par le prestataire concerné", async () => {
    // On ne supprime pas la parole de quelqu'un sans qu'il puisse la relire —
    // et le prestataire a besoin de savoir ce qui a été dit de lui.
    for (const qui of [CLARA, BOB]) {
      const { rows } = await actingAs(db, qui, async () =>
        db.query("select id from reviews where id = $1", [masque]),
      );
      expect(rows).toHaveLength(1);
    }
  });

  it("garde le motif de modération hors de toute lecture directe", async () => {
    // ⚠️ Contrôle **par le nom de la colonne**, pas par `select *` : une
    // colonne retirée du grant ne sort plus d'une étoile, et un contrôle écrit
    // ainsi passerait au vert pour la mauvaise raison.
    for (const qui of [CLARA, BOB, ADMIN]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query("select hidden_reason from reviews where id = $1", [masque]),
        ).rejects.toThrow(/permission denied/i);
      });
    }
  });

  it("le rend à l'administration par admin_reviews()", async () => {
    // Un administrateur est lui aussi `authenticated` : seule une fonction
    // `security definer` sait l'en distinguer.
    const { rows } = await actingAs(db, ADMIN, async () =>
      db.query("select hidden_reason from admin_reviews('masques') where id = $1", [masque]),
    );

    expect(rows[0].hidden_reason).toMatch(/diffamatoires/);
  });

  it("ne rend rien par admin_reviews() à qui n'est pas administrateur", async () => {
    const { rows } = await actingAs(db, CLARA, async () =>
      db.query("select id from admin_reviews('tous')"),
    );

    expect(rows).toHaveLength(0);
  });

  it("refuse à quiconque de masquer un avis sans être administrateur", async () => {
    for (const qui of [CLARA, ALICE, BOB]) {
      await actingAs(db, qui, async () => {
        await expect(
          db.query("select hide_review($1, 'Cet avis ne me convient pas du tout')", [masque]),
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
