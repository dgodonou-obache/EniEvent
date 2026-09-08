import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/lib/validation/listing";
import { RESPONSE_WINDOWS, briefSchema } from "@/lib/validation/quote";

/**
 * Le brief est le seul formulaire long de l'application, et le seul que le
 * client remplit sans avoir encore rien investi. Chaque refus doit donc être
 * justifié : ce qui est exigé ici l'est parce qu'un prestataire ne peut pas
 * répondre sans.
 */

const TRAITEUR = "11111111-1111-4111-8111-111111111111";
const DECO = "22222222-2222-4222-8222-222222222222";
const FLEURISTE = "33333333-3333-4333-8333-333333333333";

const valid = {
  title: "Mariage de 200 personnes à Cotonou",
  eventType: "mariage" as const,
  eventDate: "2026-12-19",
  city: "Cotonou",
  description:
    "Cérémonie le matin, déjeuner assis pour 200 personnes, puis soirée dansante.",
  categoryIds: [TRAITEUR, DECO],
  responseWindowHours: 48,
};

describe("brief", () => {
  it("accepte une demande complète", () => {
    expect(briefSchema.safeParse(valid).success).toBe(true);
  });

  it("exige au moins une prestation recherchée", () => {
    // Un appel d'offres sans besoin n'atteindrait personne.
    const result = briefSchema.safeParse({ ...valid, categoryIds: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).categoryIds).toMatch(/au moins une prestation/i);
  });

  it("exige une date, ou la mention que la date est souple", () => {
    // Sans l'un des deux, un prestataire ne peut pas dire s'il est libre.
    const result = briefSchema.safeParse({ ...valid, eventDate: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).eventDate).toMatch(/souple/i);
  });

  it("accepte une date souple sans date", () => {
    expect(
      briefSchema.safeParse({ ...valid, eventDate: "", isDateFlexible: true }).success,
    ).toBe(true);
  });

  it("refuse une description trop maigre", () => {
    const result = briefSchema.safeParse({ ...valid, description: "Un mariage." });
    expect(result.success).toBe(false);
  });

  it("refuse un délai de réponse hors de ceux proposés", () => {
    expect(briefSchema.safeParse({ ...valid, responseWindowHours: 3 }).success).toBe(false);
    for (const window of RESPONSE_WINDOWS) {
      expect(
        briefSchema.safeParse({ ...valid, responseWindowHours: window.value }).success,
      ).toBe(true);
    }
  });

  it("refuse un numéro à l'ancien format béninois", () => {
    // Huit chiffres : plus composable depuis le 30 novembre 2024.
    const result = briefSchema.safeParse({ ...valid, contactPhone: "97 00 00 01" });
    expect(result.success).toBe(false);
  });

  it("tolère un téléphone laissé vide", () => {
    expect(briefSchema.safeParse({ ...valid, contactPhone: "" }).success).toBe(true);
  });
});

describe("budget par prestation", () => {
  it("accepte une enveloppe pour chaque prestation demandée", () => {
    const result = briefSchema.safeParse({
      ...valid,
      budgetMax: 5_000_000,
      categoryBudgets: [
        { categoryId: TRAITEUR, budgetMax: 2_400_000 },
        { categoryId: DECO, budgetMax: 800_000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepte des enveloppes partielles", () => {
    // Beaucoup de clients ne savent pas encore répartir : exiger le détail
    // ferait abandonner le formulaire.
    const result = briefSchema.safeParse({
      ...valid,
      categoryBudgets: [
        { categoryId: TRAITEUR, budgetMax: 2_400_000 },
        { categoryId: DECO },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("refuse un budget visant une prestation non demandée", () => {
    // Il serait ignoré en silence : mieux vaut refuser que laisser croire
    // qu'il compte.
    const result = briefSchema.safeParse({
      ...valid,
      categoryBudgets: [{ categoryId: FLEURISTE, budgetMax: 300_000 }],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).categoryBudgets).toMatch(/n'est pas demandée/i);
  });

  it("refuse un montant décimal", () => {
    const result = briefSchema.safeParse({
      ...valid,
      categoryBudgets: [{ categoryId: TRAITEUR, budgetMax: 2_400_000.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("n'oppose pas le budget global à la somme des enveloppes", () => {
    // Répartir plus que l'enveloppe globale est probablement une erreur, mais
    // c'est au client d'en juger : l'écran le signale, le schéma ne bloque pas.
    const result = briefSchema.safeParse({
      ...valid,
      budgetMax: 1_000_000,
      categoryBudgets: [
        { categoryId: TRAITEUR, budgetMax: 2_400_000 },
        { categoryId: DECO, budgetMax: 800_000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("tolère l'absence totale de budget", () => {
    expect(briefSchema.safeParse(valid).success).toBe(true);
  });
});
