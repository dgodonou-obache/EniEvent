import { describe, expect, it } from "vitest";

import {
  MAX_DATES_PER_EDIT,
  buildPlanningMonth,
  clampMonth,
  dayLabel,
  isValidDateKey,
  monthLabel,
  planningWindow,
  presetSelection,
  summarizeMonth,
  validateBulkEdit,
  type PlanningDay,
} from "@/lib/planning";
import type { AvailabilityRow } from "@/lib/pricing";

/**
 * Repères — septembre 2026 commence un mardi et compte 30 jours.
 * Le 12 est un samedi, le 13 un dimanche, le 14 un lundi.
 * « Aujourd'hui » est figé au lundi 7 septembre 2026 : sans cela, les tests
 * changeraient de résultat au fil du temps.
 */

const TODAY = new Date(2026, 8, 7);
const SEPTEMBRE = new Date(2026, 8, 1);
const rule = { basePrice: 150_000, weekendMultiplier: 1.3 };

const rows: AvailabilityRow[] = [
  { date: "2026-09-03", status: "open", price: 150_000 }, // passé
  { date: "2026-09-12", status: "open", price: 120_000 }, // samedi bradé
  { date: "2026-09-13", status: "open", price: null }, // dimanche au tarif de base
  { date: "2026-09-14", status: "closed", price: 150_000 },
  { date: "2026-09-15", status: "booked", price: 150_000 },
];

function month(availabilities: AvailabilityRow[] = rows) {
  return buildPlanningMonth(SEPTEMBRE, { availabilities, dayRule: rule, today: TODAY });
}

function day(key: string, cells = month()): PlanningDay {
  const found = cells.find((cell) => cell?.key === key);
  if (!found) throw new Error(`Jour ${key} absent de la grille`);
  return found;
}

describe("grille du mois", () => {
  it("cale le 1er septembre 2026 sur un mardi", () => {
    const cells = month();
    // Une seule case vide avant le 1er : la semaine commence le lundi.
    expect(cells[0]).toBeNull();
    expect(cells[1]?.key).toBe("2026-09-01");
    expect(cells.filter((cell) => cell !== null)).toHaveLength(30);
  });
});

describe("état d'une journée", () => {
  it("marque « non renseigné » une date sans ligne", () => {
    // C'est l'état par défaut, et c'est un manque : la recherche ne retient
    // que les jours explicitement ouverts.
    expect(day("2026-09-21").state).toBe("unset");
  });

  it("affiche quand même le tarif prévu d'une date non renseignée", () => {
    const jour = day("2026-09-21"); // un lundi
    expect(jour.price?.amount).toBe(150_000);
    expect(jour.priceSource).toBe("tarif-de-base");
  });

  it("majore le week-end sur une date non renseignée", () => {
    const jour = day("2026-09-19"); // samedi
    expect(jour.price?.amount).toBe(195_000);
    expect(jour.isWeekend).toBe(true);
  });

  it("laisse le tarif du planning primer sur le tarif de base", () => {
    const jour = day("2026-09-12");
    expect(jour.price?.amount).toBe(120_000);
    expect(jour.priceSource).toBe("planning");
  });

  it("affiche le tarif d'une date fermée", () => {
    // Le partenaire doit voir ce qu'il rouvrirait — `priceForDate` seul
    // renverrait null ici.
    const jour = day("2026-09-14");
    expect(jour.state).toBe("closed");
    expect(jour.price?.amount).toBe(150_000);
  });

  it("interdit de modifier une date réservée", () => {
    const jour = day("2026-09-15");
    expect(jour.state).toBe("booked");
    expect(jour.editable).toBe(false);
  });

  it("interdit de modifier une date passée", () => {
    const jour = day("2026-09-03");
    expect(jour.isPast).toBe(true);
    expect(jour.editable).toBe(false);
  });

  it("laisse la journée en cours modifiable", () => {
    const jour = day("2026-09-07");
    expect(jour.isPast).toBe(false);
    expect(jour.editable).toBe(true);
  });

  it("n'invente aucun tarif sans règle de prix", () => {
    const cells = buildPlanningMonth(SEPTEMBRE, {
      availabilities: [],
      dayRule: null,
      today: TODAY,
    });
    expect(day("2026-09-21", cells).price).toBeNull();
  });
});

describe("compteurs du mois", () => {
  it("compte chaque état sans tenir compte du passé", () => {
    const stats = summarizeMonth(month());

    // Du 7 au 30 septembre : 24 jours, dont 4 renseignés.
    expect(stats.open).toBe(2);
    expect(stats.closed).toBe(1);
    expect(stats.booked).toBe(1);
    expect(stats.unset).toBe(20);
    expect(stats.open + stats.closed + stats.booked + stats.unset).toBe(24);
  });

  it("ignore une date ouverte mais passée", () => {
    // Le 3 septembre est ouvert en base ; il ne doit gonfler aucun compteur.
    expect(summarizeMonth(month()).open).toBe(2);
  });

  it("additionne la recette possible des dates ouvertes", () => {
    // 120 000 (samedi bradé) + 195 000 (dimanche majoré)
    expect(summarizeMonth(month()).potentialRevenue.amount).toBe(315_000);
  });
});

describe("sélection en masse", () => {
  it("retient les week-ends à venir du mois", () => {
    const keys = presetSelection(month([]), "week-ends");
    // Les 5 et 6 sont passés ; restent 12, 13, 19, 20, 26, 27.
    expect(keys).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-19",
      "2026-09-20",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("retient les jours de semaine à venir", () => {
    const keys = presetSelection(month([]), "semaine");
    expect(keys).toHaveLength(18);
    expect(keys).not.toContain("2026-09-12");
  });

  it("écarte les dates réservées et les dates passées", () => {
    const keys = presetSelection(month(), "mois");
    expect(keys).toHaveLength(23); // 24 jours à venir, moins le 15 réservé
    expect(keys).not.toContain("2026-09-15");
    expect(keys).not.toContain("2026-09-03");
  });
});

describe("contrôle d'une modification en masse", () => {
  const guard = { current: rows, minPrice: 100_000, today: TODAY };

  it("refuse une sélection vide", () => {
    const check = validateBulkEdit({ action: "open", dates: [] }, guard);
    expect(check).toEqual({ ok: false, message: "Sélectionnez au moins une date." });
  });

  it("refuse une sélection démesurée", () => {
    const dates = Array.from({ length: MAX_DATES_PER_EDIT + 1 }, (_, i) =>
      new Date(2026, 8, 7 + i).toISOString().slice(0, 10),
    );
    const check = validateBulkEdit({ action: "open", dates }, guard);
    expect(check.ok).toBe(false);
  });

  it("refuse une date passée en la nommant", () => {
    const check = validateBulkEdit({ action: "open", dates: ["2026-09-03"] }, guard);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain("3 septembre");
    expect(check.message).toContain("passé");
  });

  it("refuse une date déjà réservée en la nommant", () => {
    const check = validateBulkEdit(
      { action: "close", dates: ["2026-09-12", "2026-09-15"] },
      guard,
    );
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain("15 septembre");
    expect(check.message).toContain("déjà réservé");
  });

  it("refuse une date qui n'existe pas", () => {
    const check = validateBulkEdit({ action: "open", dates: ["2026-02-30"] }, guard);
    expect(check.ok).toBe(false);
  });

  it("refuse un tarif sous le prix plancher, chiffres à l'appui", () => {
    // La faute de frappe que le garde-fou existe pour rattraper : 15 000 saisi
    // à la place de 150 000.
    const check = validateBulkEdit(
      { action: "open", dates: ["2026-09-19"], price: 15_000 },
      guard,
    );

    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain("100");
    expect(check.message).toContain("plancher");
  });

  it("accepte un tarif égal au prix plancher", () => {
    const check = validateBulkEdit(
      { action: "open", dates: ["2026-09-19"], price: 100_000 },
      guard,
    );
    expect(check.ok).toBe(true);
  });

  it("refuse un tarif décimal", () => {
    const check = validateBulkEdit(
      { action: "open", dates: ["2026-09-19"], price: 150_000.5 },
      guard,
    );
    expect(check.ok).toBe(false);
  });

  it("n'oppose pas le prix plancher à une fermeture", () => {
    // Fermer une date n'a rien à voir avec son tarif.
    const check = validateBulkEdit({ action: "close", dates: ["2026-09-19"] }, guard);
    expect(check.ok).toBe(true);
  });

  it("ne bloque rien quand aucun prix plancher n'est fixé", () => {
    const check = validateBulkEdit(
      { action: "open", dates: ["2026-09-19"], price: 1_000 },
      { current: rows, minPrice: null, today: TODAY },
    );
    expect(check.ok).toBe(true);
  });

  it("dédoublonne et trie les dates retenues", () => {
    const check = validateBulkEdit(
      { action: "open", dates: ["2026-09-19", "2026-09-12", "2026-09-19"] },
      guard,
    );
    expect(check).toEqual({ ok: true, dates: ["2026-09-12", "2026-09-19"] });
  });
});

describe("repères de temps", () => {
  it("interdit de remonter avant le mois courant", () => {
    expect(clampMonth(new Date(2026, 4, 1), TODAY)).toEqual(new Date(2026, 8, 1));
  });

  it("plafonne la navigation à l'horizon d'ouverture", () => {
    expect(clampMonth(new Date(2030, 0, 1), TODAY)).toEqual(new Date(2027, 8, 1));
  });

  it("couvre la fenêtre de chargement jusqu'au dernier jour navigable", () => {
    expect(planningWindow(TODAY)).toEqual({ from: "2026-09-07", to: "2027-09-30" });
  });

  it("nomme les mois et les jours en français", () => {
    expect(monthLabel(SEPTEMBRE)).toBe("septembre 2026");
    expect(dayLabel("2026-09-12")).toBe("samedi 12 septembre");
  });

  it("reconnaît une clé de date valide", () => {
    expect(isValidDateKey("2026-09-12")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("12/09/2026")).toBe(false);
  });
});
