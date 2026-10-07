import { describe, expect, it } from "vitest";

import {
  ENTITY,
  entityIsComplete,
  orTodo,
  PROCESSORS,
  publishedMentions,
  registeredOffice,
  type LegalEntity,
} from "@/lib/legal";

/**
 * Identité légale.
 *
 * ⚠️ **Ces valeurs ne se relisent jamais.** Une fois publiées, elles traînent
 * sur trois pages que personne ne rouvre, et c'est un prestataire de paiement
 * qui finit par signaler le chiffre faux — après avoir refusé le dossier. Un
 * IFU à douze chiffres au lieu de treize ne se voit pas à l'œil nu.
 */

describe("immatriculation", () => {
  it("porte un IFU béninois à treize chiffres", () => {
    expect(ENTITY.ifu).toMatch(/^\d{13}$/);
  });

  it("porte un RCCM au format du registre béninois", () => {
    // RB (Registre du Bénin) / ville / année, catégorie, numéro.
    expect(ENTITY.rccm).toMatch(/^RB\/[A-Z]{3}\/\d{2} [A-Z] \d+$/);
  });

  it("énonce une forme juridique", () => {
    expect(ENTITY.legalForm).toBeTruthy();
  });
});

describe("siège social", () => {
  it("se passe d'un libellé de voie sans laisser de trou", () => {
    // Un établissement se déclare couramment à la commune. La ligne doit
    // rester lisible, sans virgule orpheline ni « à compléter ».
    const office = registeredOffice();

    expect(office).toBe("Cotonou, Bénin");
    expect(office).not.toContain("à compléter");
    expect(office.startsWith(",")).toBe(false);
    expect(office).not.toContain(", ,");
  });

  it("insère la voie quand il y en a une", () => {
    const avecVoie: LegalEntity = { ...ENTITY, address: "Lot 42, Haie Vive" };

    expect(registeredOffice(avecVoie)).toBe("Lot 42, Haie Vive, Cotonou, Bénin");
  });
});

describe("complétude", () => {
  /**
   * ⚠️ Le bandeau « document en cours de finalisation » s'efface tout seul
   * quand ce prédicat devient vrai. Il ne doit donc pas devenir vrai trop tôt :
   * c'est le dernier garde-fou avant qu'une mention légale incomplète ne passe
   * pour définitive.
   */
  it("reste incomplète dès qu'une mention publiée manque", () => {
    for (const manquant of ["legalForm", "rccm", "ifu"] as const) {
      const ampute: LegalEntity = { ...ENTITY, [manquant]: null };

      expect(entityIsComplete(ampute), manquant).toBe(false);
    }
  });

  it("n'exige pas ce qu'on a choisi de ne pas publier", () => {
    // Téléphone et directeur de la publication sont retirés de la page : les
    // réclamer laisserait un bandeau d'alerte que rien ne viendrait éteindre.
    expect(ENTITY.phone).toBeNull();
    expect(ENTITY.publicationDirector).toBeNull();
    expect(entityIsComplete()).toBe(true);
  });

  it("n'exige pas de libellé de voie", () => {
    expect(entityIsComplete({ ...ENTITY, address: null })).toBe(true);
  });

  it("ne se contente pas d'une chaîne vide", () => {
    expect(entityIsComplete({ ...ENTITY, rccm: "   " })).toBe(false);
  });
});

/**
 * ⚠️ Le défaut de conception que ce bloc interdit.
 *
 * Le bandeau d'avertissement et la liste des mentions ont vécu séparément une
 * journée, et se sont contredits dans les deux sens : un bandeau annonçant une
 * immatriculation absente **au-dessus du RCCM affiché**, puis le risque
 * inverse en retirant deux lignes. Une seule liste, relue par les deux.
 */
describe("mentions publiées", () => {
  it("sont exactement ce que la complétude surveille", () => {
    const manquantes = publishedMentions().filter(({ value }) => value === null);

    expect(manquantes.map((m) => m.label)).toEqual([]);
    expect(entityIsComplete()).toBe(manquantes.length === 0);
  });

  it("n'annoncent plus le téléphone ni le directeur de la publication", () => {
    const libelles = publishedMentions().map((m) => m.label);

    expect(libelles.some((l) => /téléphone/i.test(l))).toBe(false);
    expect(libelles.some((l) => /directeur/i.test(l))).toBe(false);
  });

  it("gardent un moyen de joindre l'éditeur", () => {
    // Retirer le téléphone est une décision ; laisser une page sans aucun
    // contact n'en serait pas une.
    expect(publishedMentions().some(({ value }) => value === ENTITY.email)).toBe(true);
  });

  it("énoncent toujours l'immatriculation", () => {
    const valeurs = publishedMentions().map((m) => m.value);

    expect(valeurs).toContain(ENTITY.rccm);
    expect(valeurs).toContain(ENTITY.ifu);
  });

  it("rendent un bandeau cohérent avec la page", () => {
    // Une mention listée mais vide doit rallumer l'avertissement, sans quoi la
    // page afficherait « à compléter » en se disant finalisée.
    const ampute: LegalEntity = { ...ENTITY, ifu: null };
    const affichees = publishedMentions(ampute);

    expect(affichees.some(({ value }) => value === null)).toBe(true);
    expect(entityIsComplete(ampute)).toBe(false);
  });
});

describe("mentions manquantes", () => {
  it("se disent en clair plutôt que de rester vides", () => {
    expect(orTodo(null)).toBe("à compléter");
    expect(orTodo("RB/COT/21 A 70480")).toBe("RB/COT/21 A 70480");
  });
});

describe("sous-traitants", () => {
  it("annoncent tous un lieu et une politique joignable", () => {
    for (const p of PROCESSORS) {
      expect(p.location, p.name).toBeTruthy();
      expect(p.site, p.name).toMatch(/^https:\/\//);
    }
  });
});
