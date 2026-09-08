import { describe, expect, it } from "vitest";

import {
  formatBeninPhone,
  isValidBeninPhone,
  normaliseBeninPhone,
} from "@/lib/validation/phone";
import { partnerSignUpSchema } from "@/lib/validation/auth";

/**
 * Le Bénin est passé à 10 chiffres le 30 novembre 2024, avec le préfixe `01`.
 * Accepter encore un ancien numéro à 8 chiffres produirait des fiches
 * prestataires injoignables — d'où l'insistance de ces tests sur le refus.
 */

describe("normalisation", () => {
  // Toutes ces écritures désignent le même numéro et doivent converger.
  it.each([
    "0197000001",
    "01 97 00 00 01",
    "+229 01 97 00 00 01",
    "00229 01 97 00 00 01",
    "+229-01-97-00-00-01",
    "(229) 01.97.00.00.01",
  ])("ramène « %s » à la forme canonique", (input) => {
    expect(normaliseBeninPhone(input)).toBe("+2290197000001");
  });
});

describe("validation", () => {
  it.each([
    "0197000001",
    "01 97 00 00 01",
    "+229 01 97 00 00 01",
    "00229 01 97 00 00 01",
    "0196000004",
    "0195000005",
  ])("accepte %s", (value) => {
    expect(isValidBeninPhone(value)).toBe(true);
  });

  it.each([
    ["97000001", "ancien format à 8 chiffres, plus composable depuis 2024"],
    ["0297000001", "ne commence pas par 01"],
    ["019700000", "un chiffre de trop peu"],
    ["01970000012", "un chiffre de trop"],
    ["+225 07 00 00 00 01", "numéro ivoirien"],
    ["+221 77 000 00 04", "numéro sénégalais"],
    ["", "vide"],
    ["pas un numéro", "texte"],
  ])("refuse %s (%s)", (value) => {
    expect(isValidBeninPhone(value)).toBe(false);
  });
});

describe("affichage", () => {
  it("groupe les chiffres par deux", () => {
    expect(formatBeninPhone("0197000001")).toBe("+229 01 97 00 00 01");
  });

  it("laisse une saisie invalide intacte plutôt que d'inventer un format", () => {
    expect(formatBeninPhone("97000001")).toBe("97000001");
  });
});

describe("intégration au formulaire d'inscription", () => {
  const valid = {
    fullName: "Awa Hounkpatin",
    email: "awa@exemple.bj",
    password: "motdepasse1",
    companyName: "Saveurs du Bénin",
    city: "Cotonou",
    phone: "01 97 00 00 01",
  };

  it("stocke le numéro sous sa forme canonique", () => {
    const parsed = partnerSignUpSchema.parse(valid);
    expect(parsed.phone).toBe("+2290197000001");
  });

  it("refuse l'inscription d'un partenaire au numéro invalide", () => {
    const result = partnerSignUpSchema.safeParse({ ...valid, phone: "97000001" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/béninois/i);
    }
  });

  it("exige un téléphone pour un partenaire", () => {
    // Un prestataire injoignable n'a pas d'intérêt sur la place de marché.
    const withoutPhone = { ...valid, phone: undefined };
    expect(partnerSignUpSchema.safeParse(withoutPhone).success).toBe(false);
  });
});
