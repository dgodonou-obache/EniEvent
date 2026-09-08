import { describe, expect, it } from "vitest";

import {
  fieldErrors,
  listingDraftSchema,
  optionalNumber,
  optionalText,
  serviceDetailsSchema,
  slugify,
  venueDetailsSchema,
} from "@/lib/validation/listing";

const validDraft = {
  title: "Salle Étoile",
  categoryId: "11111111-1111-4111-8111-111111111111",
  city: "Cotonou",
  bookingMode: "both" as const,
};

describe("brouillon d'annonce", () => {
  it("accepte une saisie complète", () => {
    expect(listingDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("refuse un titre trop court", () => {
    const result = listingDraftSchema.safeParse({ ...validDraft, title: "AB" });
    expect(result.success).toBe(false);
  });

  it("refuse un mode de réservation inventé", () => {
    const result = listingDraftSchema.safeParse({ ...validDraft, bookingMode: "troc" });
    expect(result.success).toBe(false);
  });

  it("ignore le statut et l'organisation envoyés par le client", () => {
    // Le point de sécurité : ces champs ne doivent jamais transiter par le
    // formulaire. Zod les écarte du résultat au lieu de les propager.
    const result = listingDraftSchema.parse({
      ...validDraft,
      status: "approved",
      org_id: "22222222-2222-4222-8222-222222222222",
      kind: "venue",
    });

    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("org_id");
    expect(result).not.toHaveProperty("kind");
  });
});

describe("cohérence des capacités", () => {
  it("refuse une capacité debout inférieure à la capacité assise", () => {
    const result = venueDetailsSchema.safeParse({
      capacitySeated: 200,
      capacityStanding: 150,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).capacityStanding).toMatch(/debout/i);
    }
  });

  it("accepte des capacités cohérentes", () => {
    expect(
      venueDetailsSchema.safeParse({ capacitySeated: 200, capacityStanding: 250 }).success,
    ).toBe(true);
  });

  it("refuse un minimum d'invités supérieur au maximum", () => {
    const result = serviceDetailsSchema.safeParse({ minGuests: 300, maxGuests: 100 });
    expect(result.success).toBe(false);
  });

  it("tolère une capacité non renseignée", () => {
    expect(venueDetailsSchema.safeParse({}).success).toBe(true);
  });
});

describe("lecture des champs de formulaire", () => {
  it("traite un champ vide comme non renseigné, pas comme zéro", () => {
    // Une capacité laissée vide ne veut pas dire « aucune place ».
    expect(optionalNumber("")).toBeUndefined();
    expect(optionalNumber("   ")).toBeUndefined();
    expect(optionalNumber("0")).toBe(0);
  });

  it("signale une saisie non numérique au lieu de la convertir en zéro", () => {
    expect(optionalNumber("beaucoup")).toBeNaN();
  });

  it("accepte un montant dont les milliers sont séparés", () => {
    // Les champs de saisie libre du planning et des devis n'empêchent pas
    // d'écrire un montant comme on le lit.
    expect(optionalNumber("150 000")).toBe(150_000);
    expect(optionalNumber("3 500")).toBe(3_500);
  });

  it("accepte un montant recopié depuis l'écran", () => {
    // Écrits en échappements : la différence entre une espace ordinaire et une
    // espace insécable est invisible dans le source, et un test qui la perdrait
    // passerait sans rien prouver.
    // U+202F : espace fine insécable, celle qu'`Intl` insère entre les milliers.
    expect(optionalNumber("150\u202F000")).toBe(150_000);
    // U+00A0 : insécable ordinaire, produite par certains navigateurs.
    expect(optionalNumber("1\u00A0100\u00A0000")).toBe(1_100_000);
  });

  it("nettoie le texte et vide les chaînes blanches", () => {
    expect(optionalText("  Cotonou  ")).toBe("Cotonou");
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
  });
});

describe("slug", () => {
  it("retire les accents et la ponctuation", () => {
    expect(slugify("Salle Étoile — Haie Vive")).toBe("salle-etoile-haie-vive");
  });

  it("gère les apostrophes et les esperluettes", () => {
    expect(slugify("Décoration & location d'équipement")).toBe(
      "decoration-location-d-equipement",
    );
  });

  it("ne laisse pas de tiret en bordure", () => {
    expect(slugify("  --- Villa ---  ")).toBe("villa");
  });

  it("borne la longueur", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});
