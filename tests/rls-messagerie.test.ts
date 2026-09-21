import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { maskContacts } from "@/lib/messaging/mask";

import { actingAs, createTestDatabase, type TestDatabase } from "../scripts/lib/harness.mjs";

import { A_MASQUER, A_PRESERVER } from "./messaging.test";

/**
 * Messagerie client ↔ prestataire.
 *
 * Six garanties, et chacune protège une chose précise :
 *
 * 1. **le pli cacheté** — un partenaire ne lit pas le fil d'un concurrent ;
 * 2. **le piège du `RETURNING`** — l'expéditeur relit son propre message
 *    aussitôt écrit. Une politique `SELECT` s'applique au `RETURNING` d'un
 *    `INSERT`, et une fonction `stable` ne voit pas la ligne en cours
 *    d'écriture : c'est la panne qui n'apparaît qu'à l'usage réel ;
 * 3. **l'anonymat** — avant qu'une commande existe, le prestataire ne lit aucun
 *    nom de client ;
 * 4. **le masquage** — avant encaissement, un numéro écrit ressort masqué, des
 *    deux côtés ;
 * 5. **la levée du masque** — après encaissement, le même message ressort en
 *    clair, sans avoir été réécrit ;
 * 6. **l'équipe** — un collègue d'entreprise voit le fil ouvert par son
 *    collègue.
 */

const ALICE = "aaaaaaaa-0000-4000-8000-0000000000a4"; // traiteur
const BOB = "bbbbbbbb-0000-4000-8000-0000000000b4"; // traiteur concurrent
const CLIENTE = "cccccccc-0000-4000-8000-0000000000c4"; // particulière
const COLLEGUE = "dddddddd-0000-4000-8000-0000000000d4"; // même entreprise que RH
const RH = "eeeeeeee-0000-4000-8000-0000000000e4"; // acheteuse entreprise
const ADMIN = "ffffffff-0000-4000-8000-0000000000f4";

let db: TestDatabase;
let orgAlice: string;
let orgBob: string;
let entreprise: string;
let annonceAlice: string;

/** Le fil entre la cliente particulière et Alice. */
let fil: string;

async function ouvrir(user: string, org: string, annonce: string | null = null) {
  return actingAs(db, user, async () => {
    const out = await db.query("select id from open_conversation($1, $2)", [org, annonce]);
    return out.rows[0].id as string;
  });
}

async function ecrire(user: string, conversation: string, corps: string) {
  return actingAs(db, user, () =>
    db.query("select id from send_message($1, $2)", [conversation, corps]),
  );
}

async function lire(user: string, conversation: string) {
  return actingAs(db, user, async () => {
    const out = await db.query("select * from read_conversation($1)", [conversation]);
    return out.rows as { body: string; sender_side: string; mine: boolean }[];
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}',    'alice@traiteur.bj',  '{"account_type":"partenaire"}'),
      ('${BOB}',      'bob@traiteur.bj',    '{"account_type":"partenaire"}'),
      ('${CLIENTE}',  'awa@exemple.bj',     '{"account_type":"particulier"}'),
      ('${COLLEGUE}', 'collegue@societe.bj','{"account_type":"entreprise"}'),
      ('${RH}',       'rh@societe.bj',      '{"account_type":"entreprise"}'),
      ('${ADMIN}',    'ops4@enievent.bj',   '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);
  await db.query("update profiles set full_name = 'Awa Hounkpatin' where id = $1", [CLIENTE]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, city, phone, billing_email) values
      ('partner', 'Saveurs du Benin', 'saveurs-msg', 'active', 'Cotonou', '+2290197000101', 'alice@traiteur.bj'),
      ('partner', 'Table Royale',     'royale-msg',  'active', 'Cotonou', '+2290197000102', 'bob@traiteur.bj'),
      ('company', 'Societe Test',     'societe-msg', 'active', 'Cotonou', '+2290197000103', 'rh@societe.bj')
    returning id, slug
  `);
  const bySlug = Object.fromEntries(orgs.rows.map((r) => [r.slug as string, r.id as string]));
  orgAlice = bySlug["saveurs-msg"];
  orgBob = bySlug["royale-msg"];
  entreprise = bySlug["societe-msg"];

  await db.query(
    // `manager` est un rôle de partenaire ; côté entreprise, c'est `organizer`.
    // La contrainte `role_matches_org_type` interdit de les confondre.
    `insert into organization_members (org_id, user_id, role) values
       ($1, $2, 'owner'), ($3, $4, 'owner'), ($5, $6, 'owner'), ($5, $7, 'organizer')`,
    [orgAlice, ALICE, orgBob, BOB, entreprise, RH, COLLEGUE],
  );

  const cat = await db.query("select id from categories where kind = 'service' order by slug limit 1");

  const fiches = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status, booking_mode, currency, published_at)
     values ($1, $2, 'service', 'Buffet beninois', 'buffet-msg', 'Cotonou', 'approved', 'instant', 'XOF', now())
     returning id`,
    [orgAlice, cat.rows[0].id],
  );
  annonceAlice = fiches.rows[0].id as string;

  fil = await ouvrir(CLIENTE, orgAlice, annonceAlice);
});

afterAll(async () => {
  await db?.close?.();
});

describe("ouverture d'un fil", () => {
  it("rend le même fil au second appel plutôt que d'en créer un autre", async () => {
    // Un fil par couple : c'est ce qui garde l'historique d'un bout à l'autre
    // de la relation, du premier renseignement à la dernière prestation.
    const encore = await ouvrir(CLIENTE, orgAlice, annonceAlice);
    expect(encore).toBe(fil);
  });

  it("refuse à un prestataire d'ouvrir un fil avec lui-même", async () => {
    await expect(
      actingAs(db, ALICE, () => db.query("select open_conversation($1)", [orgAlice])),
    ).rejects.toThrow(/votre propre organisation/);
  });

  it("refuse un visiteur non connecté", async () => {
    await expect(
      actingAs(db, null, () => db.query("select open_conversation($1)", [orgAlice])),
    ).rejects.toThrow();
  });
});

describe("le piège du RETURNING", () => {
  it("laisse l'expéditeur relire son message aussitôt écrit", async () => {
    // La panne qui n'apparaît qu'à l'usage : une politique `SELECT` s'applique
    // au `RETURNING` d'un `INSERT`. Si l'appartenance passait par une fonction
    // `stable` relisant la table, l'auteur se verrait refuser sa propre ligne.
    const out = await actingAs(db, CLIENTE, () =>
      db.query("select id, body from send_message($1, $2)", [fil, "Bonjour, etes-vous libre ?"]),
    );

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].body).toBe("Bonjour, etes-vous libre ?");
  });

  it("refuse un message vide plutôt que d'en écrire un blanc", async () => {
    await expect(ecrire(CLIENTE, fil, "   ")).rejects.toThrow(/vide/);
  });
});

describe("le pli cacheté", () => {
  it("cache le fil à un prestataire concurrent", async () => {
    const vus = await actingAs(db, BOB, () =>
      db.query("select count(*)::int as n from conversations where id = $1", [fil]),
    );
    expect(vus.rows[0].n).toBe(0);
  });

  it("refuse à un concurrent d'en lire le contenu", async () => {
    await expect(lire(BOB, fil)).rejects.toThrow(/ne vous est pas ouverte/);
  });

  it("refuse à un concurrent d'y écrire", async () => {
    await expect(ecrire(BOB, fil, "Je casse les prix")).rejects.toThrow(/ne vous est pas ouverte/);
  });

  it("ne laisse personne lire le corps brut d'un message", async () => {
    // `messages` n'a aucun `grant` : sans cela, un appel direct contournerait
    // le masquage en une requête.
    for (const user of [CLIENTE, ALICE, BOB]) {
      await expect(
        actingAs(db, user, () => db.query("select body from messages limit 1")),
      ).rejects.toThrow();
    }
  });
});

describe("anonymat avant engagement", () => {
  it("ne nomme pas le client au prestataire", async () => {
    const liste = await actingAs(db, ALICE, async () => {
      const out = await db.query("select * from my_conversations() where id = $1", [fil]);
      return out.rows[0];
    });

    expect(liste.counterpart).toBe("Le client");
    expect(liste.counterpart).not.toContain("Awa");
  });

  it("nomme en revanche le prestataire au client", async () => {
    // L'enseigne est publique sur l'annonce : la cacher n'apporterait rien.
    const liste = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from my_conversations() where id = $1", [fil]);
      return out.rows[0];
    });

    expect(liste.counterpart).toBe("Saveurs du Benin");
  });
});

describe("masquage des coordonnées", () => {
  beforeAll(async () => {
    await ecrire(ALICE, fil, "Oui. Appelez-moi au 01 97 00 01 02, ou ecrivez a chef@saveurs.bj");
    await ecrire(CLIENTE, fil, "Mon numero est 0197000203. Budget 150 000 FCFA pour le 24/12.");
  });

  it("masque le numéro et l'adresse du prestataire, des deux côtés", async () => {
    for (const user of [ALICE, CLIENTE]) {
      const messages = await lire(user, fil);
      const dit = messages.map((m) => m.body).join("\n");

      expect(dit, `vu par ${user}`).not.toContain("01 97 00 01 02");
      expect(dit, `vu par ${user}`).not.toContain("chef@saveurs.bj");
      expect(dit).toContain("[numéro masqué]");
      expect(dit).toContain("[adresse masquée]");
    }
  });

  it("masque aussi celui du client", async () => {
    const messages = await lire(ALICE, fil);
    const dit = messages.map((m) => m.body).join("\n");

    expect(dit).not.toContain("0197000203");
  });

  it("ne masque ni un prix, ni une date", async () => {
    // Le faux positif qui rendrait la messagerie inutilisable : on négocie des
    // montants, et un budget masqué n'aurait aucun sens.
    const messages = await lire(CLIENTE, fil);
    const dit = messages.map((m) => m.body).join("\n");

    expect(dit).toContain("150 000 FCFA");
    expect(dit).toContain("24/12");
  });

  it("laisse l'administration lire le texte brut, pour arbitrer", async () => {
    const messages = await lire(ADMIN, fil);
    const dit = messages.map((m) => m.body).join("\n");

    expect(dit).toContain("01 97 00 01 02");
  });
});

describe("levée du masque au premier encaissement", () => {
  it("rend les coordonnées visibles sans avoir réécrit un seul message", async () => {
    // Les messages sont stockés bruts : c'est ce qui permet de lever le masque
    // plus tard. Les masquer à l'écriture aurait perdu l'information.
    const avant = await lire(ALICE, fil);
    expect(avant.map((m) => m.body).join()).toContain("[numéro masqué]");

    const jour = await db.query("select (current_date + 40)::date::text as d");
    await db.query(
      `insert into availabilities (listing_id, date, price, inventory)
       values ($1, $2::date, 200000, 1)`,
      [annonceAlice, jour.rows[0].d],
    );

    const cmd = await actingAs(db, CLIENTE, async () => {
      const out = await db.query("select * from book_listing($1, array[$2::date])", [
        annonceAlice,
        jour.rows[0].d,
      ]);
      return out.rows[0];
    });

    // Une commande existe : le nom se révèle, les coordonnées restent masquées.
    const nomme = await actingAs(db, ALICE, async () => {
      const out = await db.query("select * from my_conversations() where id = $1", [fil]);
      return out.rows[0].counterpart as string;
    });
    expect(nomme).toBe("Awa Hounkpatin");

    const entreDeux = await lire(ALICE, fil);
    expect(entreDeux.map((m) => m.body).join()).toContain("[numéro masqué]");

    // Encaissement : le masque tombe.
    const echeance = await db.query(
      "select id from order_instalments where order_id = $1 order by position limit 1",
      [cmd.id],
    );
    const cle = `msg-${echeance.rows[0].id}`;
    await actingAs(db, CLIENTE, () =>
      db.query("select start_payment($1, $2)", [echeance.rows[0].id, cle]),
    );
    await db.query("select settle_payment($1, $2, 'approved', true, null, null)", [cle, `tx-${cle}`]);

    const apres = await lire(ALICE, fil);
    const dit = apres.map((m) => m.body).join("\n");

    expect(dit).toContain("01 97 00 01 02");
    expect(dit).toContain("chef@saveurs.bj");
    expect(dit).not.toContain("[numéro masqué]");
  });
});

describe("notification groupée par salve", () => {
  let filBob: string;

  beforeAll(async () => {
    filBob = await ouvrir(CLIENTE, orgBob);
    await db.query("delete from notifications where kind = 'message.new'");
  });

  it("ne pose qu'un seul courriel pour une salve de messages", async () => {
    for (const texte of ["Bonjour", "Une question de plus", "Et une autre"]) {
      await ecrire(CLIENTE, filBob, texte);
    }

    const posees = await db.query(
      "select count(*)::int as n from notifications where kind = 'message.new'",
    );
    expect(posees.rows[0].n).toBe(1);
  });

  it("rouvre le droit d'alerter dès que l'autre a répondu", async () => {
    await ecrire(BOB, filBob, "Bonjour, je regarde cela");
    await ecrire(CLIENTE, filBob, "Merci");

    const posees = await db.query(
      "select count(*)::int as n from notifications where kind = 'message.new'",
    );
    // Un pour la salve de la cliente, un pour la réponse de Bob, un pour la
    // relance de la cliente.
    expect(posees.rows[0].n).toBe(3);
  });

  it("ne met aucun extrait du message dans la charge utile", async () => {
    // ⚠️ Un extrait contournerait tout le masquage : il suffirait d'écrire son
    // numéro pour qu'il parte en clair dans une boîte de réception.
    const lignes = await db.query(
      "select payload from notifications where kind = 'message.new'",
    );

    for (const l of lignes.rows as { payload: Record<string, unknown> }[]) {
      expect(Object.keys(l.payload).sort()).toEqual([
        "conversationId",
        "pour",
        "reference",
        "sender",
      ]);
    }
  });

  it("ne nomme pas le client dans le courriel du prestataire avant engagement", async () => {
    const lignes = await db.query(
      `select payload ->> 'sender' as sender
         from notifications
        where kind = 'message.new' and payload ->> 'pour' = 'partner'`,
    );

    for (const l of lignes.rows as { sender: string }[]) {
      expect(l.sender).toBe("Un client");
    }
  });
});

describe("le masquage SQL et le masquage TypeScript", () => {
  it("rendent le même texte, sur le même corpus", async () => {
    // Toute divergence est un bug : l'avertissement affiché pendant la saisie
    // annoncerait un masquage que la base n'appliquerait pas, ou l'inverse —
    // et l'utilisateur perdrait confiance dans les deux.
    for (const forme of [...A_MASQUER, ...A_PRESERVER]) {
      const phrase = `Voici : ${forme} — merci.`;

      const sql = await db.query("select app.mask_contacts($1) as sorti", [phrase]);

      expect(sql.rows[0].sorti, forme).toBe(maskContacts(phrase));
    }
  });
});

describe("le fil d'une entreprise est celui de l'équipe", () => {
  it("laisse un collègue lire le fil ouvert par sa collègue", async () => {
    const demandes = await actingAs(db, RH, async () => {
      const out = await db.query(
        `insert into quote_requests (requester_id, org_id, title, event_type, city, description)
         values ($1, $2, 'Seminaire annuel', 'seminaire', 'Cotonou', 'Deux jours, 80 personnes.')
         returning id`,
        [RH, entreprise],
      );
      return out.rows[0].id as string;
    });

    const filEntreprise = await actingAs(db, RH, async () => {
      const out = await db.query("select id from open_conversation($1, null, $2)", [
        orgAlice,
        demandes,
      ]);
      return out.rows[0].id as string;
    });

    await ecrire(RH, filEntreprise, "Bonjour, pouvez-vous nous proposer un menu ?");

    // Le collègue n'a rien ouvert, mais il doit suivre le dossier : budgets et
    // validations sont déjà des fonctions d'équipe dans cet espace.
    const vus = await actingAs(db, COLLEGUE, async () => {
      const out = await db.query("select count(*)::int as n from my_conversations() where id = $1", [
        filEntreprise,
      ]);
      return out.rows[0].n as number;
    });
    expect(vus).toBe(1);

    const messages = await lire(COLLEGUE, filEntreprise);
    expect(messages).toHaveLength(1);

    // Et il peut répondre au nom de l'entreprise.
    await ecrire(COLLEGUE, filEntreprise, "Je complete : budget de 2 000 000 FCFA.");
    const apres = await lire(RH, filEntreprise);
    expect(apres).toHaveLength(2);
    expect(apres[1].sender_side).toBe("client");
  });
});
