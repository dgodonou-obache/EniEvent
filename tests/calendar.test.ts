import { describe, expect, it } from "vitest";

import {
  advanceRange,
  buildMonthGrid,
  expandRange,
  isInRange,
  isRangeSelectable,
  isSelectable,
  toKey,
  toggleDate,
} from "@/lib/calendar";

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("grille du mois", () => {
  it("commence la semaine le lundi", () => {
    // 1er septembre 2026 est un mardi : une seule case vide avant.
    const grid = buildMonthGrid(d("2026-09-01"));
    expect(grid[0]).toBeNull();
    expect(grid[1]).toEqual(d("2026-09-01"));
    expect(grid.filter((c) => c === null)).toHaveLength(1);
  });

  it("décale correctement un mois commençant un dimanche", () => {
    // 1er novembre 2026 est un dimanche : six cases vides, pas zéro.
    const grid = buildMonthGrid(d("2026-11-01"));
    expect(grid.filter((c) => c === null)).toHaveLength(6);
    expect(grid[6]).toEqual(d("2026-11-01"));
  });

  it("contient tous les jours du mois", () => {
    expect(buildMonthGrid(d("2026-02-10")).filter(Boolean)).toHaveLength(28);
    expect(buildMonthGrid(d("2028-02-10")).filter(Boolean)).toHaveLength(29);
    expect(buildMonthGrid(d("2026-09-10")).filter(Boolean)).toHaveLength(30);
  });
});

describe("sélectionnabilité", () => {
  const today = d("2026-09-06");

  it("refuse le passé, accepte aujourd'hui", () => {
    expect(isSelectable(d("2026-09-05"), { today })).toBe(false);
    expect(isSelectable(d("2026-09-06"), { today })).toBe(true);
  });

  it("respecte les bornes minimale et maximale", () => {
    const options = { today, minDate: d("2026-09-10"), maxDate: d("2026-09-20") };
    expect(isSelectable(d("2026-09-09"), options)).toBe(false);
    expect(isSelectable(d("2026-09-10"), options)).toBe(true);
    expect(isSelectable(d("2026-09-20"), options)).toBe(true);
    expect(isSelectable(d("2026-09-21"), options)).toBe(false);
  });

  it("respecte la liste des dates ouvertes", () => {
    const options = { today, availableDates: ["2026-09-10", "2026-09-12"] };
    expect(isSelectable(d("2026-09-10"), options)).toBe(true);
    expect(isSelectable(d("2026-09-11"), options)).toBe(false);
  });

  it("produit la clé attendue par la base", () => {
    expect(toKey(d("2026-09-06"))).toBe("2026-09-06");
  });
});

describe("sélection multiple", () => {
  it("ajoute une date et garde l'ordre chronologique", () => {
    const result = toggleDate([d("2026-09-12")], d("2026-09-10"));
    expect(result.map(toKey)).toEqual(["2026-09-10", "2026-09-12"]);
  });

  it("retire une date déjà sélectionnée", () => {
    const result = toggleDate([d("2026-09-10"), d("2026-09-12")], d("2026-09-10"));
    expect(result.map(toKey)).toEqual(["2026-09-12"]);
  });

  it("compare par jour, pas par instant", () => {
    // Deux Date du même jour à des heures différentes ne doivent pas coexister.
    const morning = new Date(2026, 8, 10, 9, 0);
    const evening = new Date(2026, 8, 10, 21, 0);
    expect(toggleDate([morning], evening)).toHaveLength(0);
  });
});

describe("plages", () => {
  it("pose le début puis la fin", () => {
    const first = advanceRange(undefined, d("2026-09-10"));
    expect(first).toEqual({ from: d("2026-09-10") });

    const complete = advanceRange(first, d("2026-09-12"));
    expect(complete).toEqual({ from: d("2026-09-10"), to: d("2026-09-12") });
  });

  it("recommence une nouvelle plage au troisième clic", () => {
    const complete = { from: d("2026-09-10"), to: d("2026-09-12") };
    expect(advanceRange(complete, d("2026-09-20"))).toEqual({ from: d("2026-09-20") });
  });

  it("réinterprète une fin antérieure au début", () => {
    const started = { from: d("2026-09-12") };
    expect(advanceRange(started, d("2026-09-10"))).toEqual({ from: d("2026-09-10") });
  });

  it("détermine l'appartenance à une plage", () => {
    const range = { from: d("2026-09-10"), to: d("2026-09-12") };
    expect(isInRange(d("2026-09-09"), range)).toBe(false);
    expect(isInRange(d("2026-09-11"), range)).toBe(true);
    expect(isInRange(d("2026-09-13"), range)).toBe(false);
  });

  it("déplie une plage bornes comprises", () => {
    const dates = expandRange({ from: d("2026-09-10"), to: d("2026-09-12") });
    expect(dates.map(toKey)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("refuse une plage dont un seul jour est fermé", () => {
    // Un lieu fermé le lundi ne se loue pas du samedi au mardi.
    const options = {
      today: d("2026-09-06"),
      availableDates: ["2026-09-12", "2026-09-13", "2026-09-15"],
    };
    const range = { from: d("2026-09-12"), to: d("2026-09-15") };

    expect(isRangeSelectable(range, options)).toBe(false);
    expect(isRangeSelectable({ from: d("2026-09-12"), to: d("2026-09-13") }, options)).toBe(true);
  });
});
