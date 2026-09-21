import { describe, expect, it } from "vitest";

import { containsContact, maskContacts, MASQUE_ADRESSE, MASQUE_NUMERO } from "@/lib/messaging/mask";

/**
 * Masquage des coordonnées.
 *
 * Deux défauts symétriques, et le second est le plus grave :
 *
 * - **laisser passer un numéro** — la vente part hors plateforme, la commission
 *   ne s'applique à rien ;
 * - **masquer ce qui n'est pas un numéro** — un budget, une date, une référence
 *   de commande. Une messagerie où l'on ne peut pas annoncer « 150 000 FCFA »
 *   ne sert à rien, et l'utilisateur n'a aucun moyen de comprendre pourquoi.
 *
 * Le corpus ci-dessous est **partagé avec `tests/rls-messagerie.test.ts`**, qui
 * le rejoue contre `app.mask_contacts` en base. Toute divergence est un bug.
 */

/** Ce qui doit être masqué, avec la forme telle qu'on l'écrit vraiment. */
export const A_MASQUER = [
  "+229 01 97 00 00 01",
  "+2290197000001",
  "00229 01 97 00 00 01",
  "0197000001",
  "01 97 00 00 01",
  "01.97.00.00.01",
  "01-97-00-00-01",
  "contact@enievent.com",
  "awa.hounkpatin+pro@exemple.bj",
];

/** Ce qui doit passer intact. */
export const A_PRESERVER = [
  "150 000 FCFA",
  "1 500 000 FCFA",
  "15 000 000 FCFA",
  "Le 24/12/2026 à 18h",
  "CMD-202609-000062",
  "RMB-202609-000078",
  "200 couverts pour 80 personnes",
  "RB/COT/25 A 1234",
];

describe("ce qui doit être masqué", () => {
  it("attrape les numéros béninois sous toutes leurs graphies", () => {
    // Un numéro se recopie à la main : avec des espaces, des points, des
    // tirets, avec ou sans indicatif. Ne couvrir qu'une forme n'en couvre
    // aucune.
    for (const forme of A_MASQUER.filter((f) => !f.includes("@"))) {
      const sorti = maskContacts(`Appelez-moi au ${forme} merci`);

      expect(sorti, forme).toContain(MASQUE_NUMERO);
      expect(sorti, forme).not.toContain(forme);
    }
  });

  it("attrape les adresses électroniques", () => {
    for (const forme of A_MASQUER.filter((f) => f.includes("@"))) {
      const sorti = maskContacts(`Écrivez à ${forme} plutôt`);

      expect(sorti, forme).toContain(MASQUE_ADRESSE);
      expect(sorti, forme).not.toContain(forme);
    }
  });

  it("en attrape plusieurs dans le même message", () => {
    const sorti = maskContacts("Tel 0197000001 ou mail chef@saveurs.bj, au choix.");

    expect(sorti).toBe(`Tel ${MASQUE_NUMERO} ou mail ${MASQUE_ADRESSE}, au choix.`);
  });

  it("masque une adresse avant d'y voir des chiffres", () => {
    // L'ordre compte : une adresse contient parfois un numéro, et la traiter
    // en second la laisserait à moitié masquée, donc illisible mais toujours
    // reconstituable.
    const sorti = maskContacts("ecris a moi0197000001@exemple.bj");

    expect(sorti).toBe(`ecris a ${MASQUE_ADRESSE}`);
    expect(sorti).not.toContain(MASQUE_NUMERO);
  });
});

describe("ce qui doit passer intact", () => {
  it("laisse les montants, les dates et les références", () => {
    // Le faux positif qui rendrait la messagerie inutilisable : on négocie des
    // prix, et un budget masqué n'a aucun sens.
    for (const forme of A_PRESERVER) {
      expect(maskContacts(`Budget : ${forme} au total`), forme).toBe(
        `Budget : ${forme} au total`,
      );
    }
  });

  it("ne touche pas un texte ordinaire", () => {
    const texte = "Bonjour, la salle est-elle climatisée ? Nous serons 180 personnes.";
    expect(maskContacts(texte)).toBe(texte);
  });

  it("tolère une entrée vide sans se plaindre", () => {
    expect(maskContacts("")).toBe("");
  });
});

describe("avertissement à la saisie", () => {
  it("signale un numéro pendant qu'on le tape", () => {
    // Découvrir après envoi que son numéro n'est pas passé se lit comme une
    // panne ; le dire avant, comme une règle.
    expect(containsContact("Mon numero est 0197000001")).toBe(true);
    expect(containsContact("Écrivez à chef@saveurs.bj")).toBe(true);
  });

  it("ne crie pas au loup sur un message ordinaire", () => {
    expect(containsContact("Nous serons 180 personnes, budget 900 000 FCFA.")).toBe(false);
  });
});
