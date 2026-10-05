import { describe, expect, it } from "vitest";

import {
  ENTITY,
  entityIsComplete,
  orTodo,
  PROCESSORS,
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
  it("reste incomplète tant qu'il manque une mention obligatoire", () => {
    for (const manquant of ["legalForm", "rccm", "ifu", "phone", "publicationDirector"] as const) {
      const ampute: LegalEntity = { ...ENTITY, [manquant]: null };

      expect(entityIsComplete(ampute), manquant).toBe(false);
    }
  });

  it("n'exige pas de libellé de voie", () => {
    const complet: LegalEntity = {
      ...ENTITY,
      address: null,
      phone: "+2290100000000",
      publicationDirector: "Quelqu'un",
    };

    expect(entityIsComplete(complet)).toBe(true);
  });

  it("ne se contente pas d'une chaîne vide", () => {
    expect(entityIsComplete({ ...ENTITY, rccm: "   " })).toBe(false);
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
