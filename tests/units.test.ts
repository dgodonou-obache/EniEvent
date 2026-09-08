import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PRICE_UNITS,
  UNIT_CATALOGUE_LABELS,
  UNIT_FORM_LABELS,
  UNIT_LABELS,
  UNIT_OPTIONS,
} from "@/lib/units";
import { pricingRuleSchema } from "@/lib/validation/listing";
import { quoteLineSchema } from "@/lib/validation/quote";

/**
 * Le risque, sur les unités, n'est pas de se tromper de calcul : c'est d'en
 * ajouter une en base et d'oublier un des écrans qui la proposent. Ce test
 * reconstruit l'énumération telle que les migrations la définissent, et la
 * compare à la liste du code.
 */

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);

/** Rejoue `create type` puis les `alter type ... add value` dans l'ordre. */
function unitsFromMigrations(): string[] {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();

  let units: string[] = [];

  for (const file of files) {
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");

    const created = sql.match(/create type price_unit as enum \(([^)]*)\)/);
    if (created) {
      units = created[1].split(",").map((value) => value.trim().replace(/'/g, ""));
    }

    const added = sql.matchAll(
      /alter type price_unit add value(?: if not exists)? '(\w+)'(?:\s+(before|after) '(\w+)')?/g,
    );

    for (const match of added) {
      const [, value, position, anchor] = match;
      if (units.includes(value)) continue;

      const at = anchor ? units.indexOf(anchor) : -1;
      if (at === -1) units.push(value);
      else units.splice(position === "before" ? at : at + 1, 0, value);
    }
  }

  return units;
}

describe("accord avec la base", () => {
  it("reprend l'énumération price_unit, dans son ordre", () => {
    expect([...PRICE_UNITS]).toEqual(unitsFromMigrations());
  });

  it("connaît le mètre carré", () => {
    // Unité courante au Bénin : chapiteaux, moquette, stands, habillage de salle.
    expect(unitsFromMigrations()).toContain("square_meter");
    expect(PRICE_UNITS).toContain("square_meter");
  });
});

describe("libellés", () => {
  it("donne les trois formulations pour chaque unité", () => {
    for (const unit of PRICE_UNITS) {
      expect(UNIT_FORM_LABELS[unit], `formulaire : ${unit}`).toBeTruthy();
      expect(UNIT_LABELS[unit], `devis : ${unit}`).toBeTruthy();
      expect(UNIT_CATALOGUE_LABELS[unit], `catalogue : ${unit}`).toBeTruthy();
    }
  });

  it("ne laisse fuiter aucun identifiant technique", () => {
    // Chercher les mots anglais ne marcherait pas : « Par personne » contient
    // « person ». Ce qui trahit un identifiant oublié, c'est le tiret bas, ou
    // un libellé identique à la valeur d'énumération.
    const all = [
      ...Object.values(UNIT_FORM_LABELS),
      ...Object.values(UNIT_LABELS),
      ...Object.values(UNIT_CATALOGUE_LABELS),
    ];

    for (const label of all) {
      expect(label).not.toContain("_");
      expect(PRICE_UNITS as readonly string[]).not.toContain(label);
    }
  });

  it("dit le mètre carré comme on le dit à l'oral", () => {
    expect(UNIT_FORM_LABELS.square_meter).toBe("Au mètre carré");
    expect(UNIT_LABELS.square_meter).toBe("par m²");
    expect(UNIT_CATALOGUE_LABELS.square_meter).toBe("le m²");
  });

  it("propose toutes les unités dans les listes déroulantes", () => {
    expect(UNIT_OPTIONS.map((option) => option.value)).toEqual([...PRICE_UNITS]);
  });
});

describe("validation", () => {
  it("accepte un tarif d'annonce au mètre carré", () => {
    const parsed = pricingRuleSchema.safeParse({
      unit: "square_meter",
      basePrice: 3_500,
      weekendMultiplier: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepte une ligne de devis au mètre carré", () => {
    // 180 m² de moquette à 3 500 F : le cas qui motive l'unité.
    const parsed = quoteLineSchema.safeParse({
      label: "Moquette de sol",
      quantity: 180,
      unit: "square_meter",
      unitPrice: 3_500,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.quantity * parsed.data.unitPrice).toBe(630_000);
  });

  it("refuse une unité inventée", () => {
    const parsed = pricingRuleSchema.safeParse({
      unit: "au_kilo",
      basePrice: 1_000,
      weekendMultiplier: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
