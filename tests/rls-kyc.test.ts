import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { KYC_REQUIRED, KYC_TYPES } from "@/lib/validation/partner";
import { actingAs, createTestDatabase, projectRoot, type TestDatabase } from "../scripts/lib/harness.mjs";

/**
 * Dossiers KYC — migration 0055.
 *
 * ⚠️ **Le badge « vérifié » ne pouvait pas être gagné.** Mesuré le 5 novembre
 * 2026 : zéro pièce déposée dans toute la base, zéro fichier dans le seau, et
 * six partenaires marqués « vérifiés » — les six organisations de démonstration,
 * par le *seed*. `is_verified` ayant été retirée du `grant update` par la
 * migration 0021, **aucune fonction du dépôt ne pouvait l'écrire** : le badge
 * n'était pas mal attribué, il n'existait aucun chemin pour l'attribuer. Et
 * aucun écran ne montrait les documents, si bien qu'un partenaire qui déposait
 * lisait « En cours de vérification » indéfiniment.
 *
 * Trois garanties sont gardées ici :
 *
 * - **la décision appartient à l'administration**, et à elle seule ;
 * - **le badge se recalcule**, il ne se décrète pas — approuver la dernière
 *   pièce l'allume, refuser une pièce déjà approuvée l'éteint ;
 * - **une annonce ne devient visible qu'après validation du dossier**, et ce
 *   refus vit dans un déclencheur de table, pas dans l'écran.
 */

const PATRON = "aaaaaaaa-0000-4000-8000-0000000000d1";
const EQUIPIER = "cccccccc-0000-4000-8000-0000000000d1";
const ADMIN = "ffffffff-0000-4000-8000-0000000000d1";

let db: TestDatabase;
let org: string;
let categorie: string;

/** Dépose une pièce, comme le fait `/pro/documents`. */
async function deposer(type: string, cible = org) {
  const out = await db.query(
    `insert into kyc_documents (org_id, type, file_path)
     values ($1, $2::kyc_document_type, $3) returning id`,
    [cible, type, `${cible}/${type}-1.pdf`],
  );
  return out.rows[0].id as string;
}

async function trancher(piece: string, decision: "approved" | "rejected", motif?: string) {
  return actingAs(db, ADMIN, () =>
    db.query("select review_kyc_document($1, $2::kyc_status, $3)", [piece, decision, motif ?? null]),
  );
}

async function estVerifie(cible = org) {
  const out = await db.query("select is_verified, verified_at from partner_profiles where org_id = $1", [
    cible,
  ]);
  return out.rows[0] as { is_verified: boolean; verified_at: string | null };
}

/** Dépose une annonce et tente de la publier en tant qu'administrateur. */
async function publier(cible = org): Promise<string | null> {
  const fiche = await db.query(
    `insert into listings (org_id, category_id, kind, title, slug, city, status, booking_mode, currency)
     values ($1, $2, 'venue', $3, $4, 'Cotonou', 'pending', 'quote', 'XOF')
     returning id`,
    [cible, categorie, `Annonce ${Date.now()}`, `annonce-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`],
  );

  try {
    const out = await actingAs(db, ADMIN, () =>
      db.query("update listings set status = 'approved' where id = $1 returning id", [
        fiche.rows[0].id,
      ]),
    );
    // ⚠️ Un UPDATE masqué par la RLS ne lève rien : il touche zéro ligne.
    return out.rows.length === 1 ? null : "aucune ligne touchée";
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = await createTestDatabase();

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${PATRON}',   'patron@kyc.bj',   '{"account_type":"partenaire"}'),
      ('${EQUIPIER}', 'equipier@kyc.bj', '{"account_type":"partenaire"}'),
      ('${ADMIN}',    'ops@kyc.bj',      '{}');
  `);

  await db.query("update profiles set account_type = 'admin' where id = $1", [ADMIN]);

  const orgs = await db.query(`
    insert into organizations (type, legal_name, slug, status, phone)
    values ('partner', 'Salle KYC', 'salle-kyc', 'active', '+2290197000050')
    returning id
  `);
  org = orgs.rows[0].id as string;

  await db.query("insert into partner_profiles (org_id) values ($1)", [org]);
  await db.query(
    `insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')`,
    [org, PATRON, EQUIPIER],
  );

  const cat = await db.query("select id from categories where kind = 'venue' order by slug limit 1");
  categorie = cat.rows[0].id as string;
});

afterAll(async () => {
  await db?.close?.();
});

describe("les pièces obligatoires", () => {
  /**
   * ⚠️ **`insurance` est conditionnelle et n'entre pas dans le compte.**
   * L'exiger rendrait tout dossier incomplet à jamais — la plupart des
   * prestataires n'en déposeront aucune —, donc le badge inatteignable et la
   * publication impossible. C'est le genre de défaut qui se découvre trois
   * semaines plus tard, sur un partenaire bloqué sans explication.
   */
  /** PGlite rend un tableau Postgres sous forme de texte : on le déplie en lignes. */
  async function exigees(): Promise<string[]> {
    const out = await db.query("select unnest(app.kyc_required_types())::text as type");
    return (out.rows as { type: string }[]).map((r) => r.type).sort();
  }

  it("n'exige pas l'assurance, qui est facultative", async () => {
    expect(await exigees()).not.toContain("insurance");
    expect(await exigees()).toEqual(["bank_details", "id_card", "ifu", "rccm"]);
  });

  it("dit la même chose que l'écran du partenaire", async () => {
    // La liste vit aux deux endroits : ici pour décider, dans `KYC_TYPES` pour
    // l'afficher avec ses libellés. Une divergence donnerait un écran qui
    // réclame une pièce que la base ignore, ou l'inverse.
    const sql = readFileSync(join(projectRoot, "supabase/migrations/0055_dossier_kyc.sql"), "utf8");
    expect(sql).toContain("insurance");

    expect([...KYC_REQUIRED].sort()).toEqual(await exigees());

    // Et la liste affichée garde bien l'assurance, en facultatif : la retirer
    // de l'écran la rendrait indéposable au lieu de la rendre optionnelle.
    expect(KYC_TYPES.map((t) => t.value)).toContain("insurance");
  });
});

describe("qui tranche un dossier", () => {
  it("refuse la décision au partenaire comme à son équipier", async () => {
    const piece = await deposer("id_card");

    for (const qui of [PATRON, EQUIPIER]) {
      await expect(
        actingAs(db, qui, () =>
          db.query("select review_kyc_document($1, 'approved'::kyc_status, null)", [piece]),
        ),
        qui,
      ).rejects.toThrow(/administration/);
    }

    // Et la pièce n'a pas bougé : une fonction qui lève après avoir écrit
    // laisserait un dossier validé par son propre titulaire.
    const out = await db.query("select status from kyc_documents where id = $1", [piece]);
    expect(out.rows[0].status).toBe("pending");
  });

  it("refuse aussi l'écriture directe sur la colonne du badge", async () => {
    // ⚠️ `is_verified` n'est dans aucun `grant update` depuis la migration
    // 0021 : un `update` direct ne lève rien et touche **zéro ligne**. On
    // vérifie donc la valeur, jamais seulement l'absence d'erreur.
    await actingAs(db, PATRON, () =>
      db
        .query("update partner_profiles set is_verified = true where org_id = $1", [org])
        .catch(() => undefined),
    );

    expect((await estVerifie()).is_verified).toBe(false);
  });

  it("exige un motif pour refuser", async () => {
    const piece = await deposer("rccm");

    await expect(trancher(piece, "rejected")).rejects.toThrow(/motif/);
    await expect(trancher(piece, "rejected", "   ")).rejects.toThrow(/motif/);
  });

  it("garde la trace de qui a tranché, et quand", async () => {
    const piece = await deposer("ifu");
    await trancher(piece, "approved");

    const out = await db.query(
      "select status, reviewed_by, reviewed_at from kyc_documents where id = $1",
      [piece],
    );

    expect(out.rows[0].status).toBe("approved");
    expect(out.rows[0].reviewed_by).toBe(ADMIN);
    expect(out.rows[0].reviewed_at).not.toBeNull();
  });
});

describe("le badge se recalcule, il ne se décrète pas", () => {
  const fiche: Record<string, string> = {};

  beforeAll(async () => {
    await db.query("delete from kyc_documents where org_id = $1", [org]);
    await db.query("update partner_profiles set is_verified = false, verified_at = null where org_id = $1", [org]);

    for (const type of ["id_card", "rccm", "ifu", "bank_details"]) {
      fiche[type] = await deposer(type);
    }
  });

  it("reste éteint tant qu'une pièce manque", async () => {
    for (const type of ["id_card", "rccm", "ifu"]) {
      await trancher(fiche[type], "approved");
      expect((await estVerifie()).is_verified, `après ${type}`).toBe(false);
    }
  });

  it("s'allume à la dernière pièce approuvée", async () => {
    await trancher(fiche.bank_details, "approved");

    const profil = await estVerifie();
    expect(profil.is_verified).toBe(true);
    expect(profil.verified_at).not.toBeNull();
  });

  /**
   * ⚠️ La garantie qui compte. Un badge qui survivrait au retrait d'une pièce
   * serait exactement ce qu'il était avant cette migration : une affirmation
   * que plus rien ne soutient.
   */
  it("s'éteint si une pièce déjà approuvée est refusée", async () => {
    await trancher(fiche.rccm, "rejected", "Extrait illisible, merci de rescanner.");

    const profil = await estVerifie();
    expect(profil.is_verified).toBe(false);
    expect(profil.verified_at).toBeNull();
  });

  it("se rallume sur une nouvelle version, sans effacer la refusée", async () => {
    // Le partenaire redépose : l'ancienne ligne reste refusée, la nouvelle est
    // approuvée. Compter les refus bloquerait un dossier pourtant complet.
    const neuve = await deposer("rccm");
    await trancher(neuve, "approved");

    expect((await estVerifie()).is_verified).toBe(true);

    const refusees = await db.query(
      "select count(*)::int as n from kyc_documents where org_id = $1 and status = 'rejected'",
      [org],
    );
    expect(refusees.rows[0].n).toBe(1);
  });
});

describe("une annonce ne devient visible qu'après validation du dossier", () => {
  let sansDossier: string;

  beforeAll(async () => {
    const orgs = await db.query(`
      insert into organizations (type, legal_name, slug, status, phone)
      values ('partner', 'Salle Sans Dossier', 'salle-sans-dossier', 'active', '+2290197000051')
      returning id
    `);
    sansDossier = orgs.rows[0].id as string;
    await db.query("insert into partner_profiles (org_id) values ($1)", [sansDossier]);
    // Le patron en est propriétaire : sans appartenance, la RLS refuserait son
    // brouillon et le cas « le dépôt reste libre » échouerait pour une tout
    // autre raison que celle qu'il mesure.
    await db.query(
      "insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')",
      [sansDossier, PATRON],
    );
  });

  it("refuse la mise en ligne et nomme ce qui manque", async () => {
    const refus = await publier(sansDossier);

    expect(refus).toMatch(/Dossier du prestataire incomplet/);
    expect(refus).toMatch(/id_card/);
  });

  it("laisse passer dès que le dossier est validé", async () => {
    // L'organisation du premier bloc a son dossier complet.
    expect((await estVerifie()).is_verified).toBe(true);
    expect(await publier(org)).toBeNull();
  });

  /**
   * ⚠️ **Le dépôt reste libre.** « Le partenaire peut faire sa demande pour
   * publier une annonce, mais l'annonce ne sera visible qu'après validation. »
   * Bloquer `pending` aurait fermé la porte d'entrée au lieu de la sortie.
   */
  it("n'empêche ni le brouillon ni la soumission", async () => {
    for (const etat of ["draft", "pending"]) {
      const out = await actingAs(db, PATRON, () =>
        db.query(
          `insert into listings (org_id, category_id, kind, title, slug, city, status, booking_mode, currency)
           values ($1, $2, 'venue', $3, $4, 'Cotonou', $5::listing_status, 'quote', 'XOF') returning id`,
          [sansDossier, categorie, `Brouillon ${etat}`, `brouillon-${etat}-${Date.now()}`, etat],
        ),
      ).catch((e: Error) => e);

      expect(out, etat).not.toBeInstanceOf(Error);
    }
  });

  /**
   * ⚠️ **Les annonces déjà publiées ne bougent pas.** Le déclencheur ne regarde
   * que la transition vers `approved` : dépublier rétroactivement aurait vidé
   * la vitrine d'un seul coup, sur une décision qui ne visait que la suite.
   */
  it("ne redescend pas une annonce déjà en ligne", async () => {
    const fiche = await db.query(
      `insert into listings (org_id, category_id, kind, title, slug, city, status, booking_mode, currency)
       values ($1, $2, 'venue', 'Déjà en ligne', 'deja-en-ligne-kyc', 'Cotonou', 'approved', 'quote', 'XOF')
       returning id`,
      [sansDossier, categorie],
    );

    // Une retouche quelconque sur une annonce approuvée d'un dossier incomplet.
    const out = await actingAs(db, ADMIN, () =>
      db.query("update listings set status = 'approved', title = 'Retouchée' where id = $1 returning id", [
        fiche.rows[0].id,
      ]),
    );

    expect(out.rows).toHaveLength(1);
  });

  it("n'oppose rien à la clé de service", async () => {
    // Le *seed* et `demo:reset` écrivent des annonces déjà validées. Un
    // contrôle qui casse le jeu de démonstration finit par être retiré entier.
    const out = await db.query(
      `insert into listings (org_id, category_id, kind, title, slug, city, status, booking_mode, currency)
       values ($1, $2, 'venue', 'Par le seed', 'par-le-seed-kyc', 'Cotonou', 'approved', 'quote', 'XOF')
       returning id`,
      [sansDossier, categorie],
    );

    expect(out.rows).toHaveLength(1);
  });
});
