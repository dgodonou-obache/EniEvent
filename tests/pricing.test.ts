import { describe, expect, it } from "vitest";

import { format } from "@/lib/money";
import {
  SERVICE_FEE_RATE,
  cheapestOpenDay,
  isWeekend,
  optionsTotal,
  priceForDate,
  quote,
  type PricingContext,
} from "@/lib/pricing";

/**
 * Module financier : couverture obligatoire. Un écart d'un franc ici se
 * retrouve sur une facture.
 *
 * Repères de dates — 2026-09-11 vendredi, 12 samedi, 13 dimanche, 14 lundi.
 */

const rule = { basePrice: 150_000, weekendMultiplier: 1.3 };

/**
 * Planning ouvert sans tarif du jour : le tarif de base s'applique. Les lignes
 * sont indispensables — un devis ne peut porter que sur des dates que le
 * prestataire a explicitement ouvertes.
 */
const openWithoutPrice = [
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
  "2026-09-14",
].map((date) => ({ date, status: "open" as const, price: null }));

function context(overrides: Partial<PricingContext> = {}): PricingContext {
  return { availabilities: openWithoutPrice, dayRule: rule, ...overrides };
}

describe("week-end", () => {
  it("reconnaît samedi et dimanche", () => {
    expect(isWeekend("2026-09-12")).toBe(true);
    expect(isWeekend("2026-09-13")).toBe(true);
  });

  it("ne se trompe pas de fuseau", () => {
    // `new Date("2026-09-14")` serait lue en UTC et pourrait basculer la veille
    // selon le fuseau : lundi doit rester lundi.
    expect(isWeekend("2026-09-14")).toBe(false);
    expect(isWeekend("2026-09-11")).toBe(false);
  });
});

describe("tarif d'une journée", () => {
  it("applique le tarif de base en semaine", () => {
    const day = priceForDate("2026-09-11", context());
    expect(day?.amount.amount).toBe(150_000);
    expect(day?.source).toBe("tarif-de-base");
  });

  it("majore le week-end", () => {
    const day = priceForDate("2026-09-12", context());
    expect(day?.amount.amount).toBe(195_000); // 150 000 × 1,3
    expect(day?.isWeekend).toBe(true);
  });

  it("laisse le planning primer sur le tarif de base", () => {
    // Le prestataire a bradé un samedi : sa décision prime sur la majoration.
    const day = priceForDate(
      "2026-09-12",
      context({
        availabilities: [{ date: "2026-09-12", status: "open", price: 120_000 }],
      }),
    );

    expect(day?.amount.amount).toBe(120_000);
    expect(day?.source).toBe("planning");
  });

  it("retombe sur le tarif de base quand le planning ne fixe pas de prix", () => {
    const day = priceForDate(
      "2026-09-11",
      context({ availabilities: [{ date: "2026-09-11", status: "open", price: null }] }),
    );
    expect(day?.amount.amount).toBe(150_000);
    expect(day?.source).toBe("tarif-de-base");
  });

  it("refuse une date fermée", () => {
    const closed = context({
      availabilities: [{ date: "2026-09-14", status: "closed", price: 150_000 }],
    });
    expect(priceForDate("2026-09-14", closed)).toBeNull();
  });

  it("refuse une date déjà réservée", () => {
    const booked = context({
      availabilities: [{ date: "2026-09-12", status: "booked", price: 195_000 }],
    });
    expect(priceForDate("2026-09-12", booked)).toBeNull();
  });

  it("ne devine aucun prix en l'absence de tarif", () => {
    expect(priceForDate("2026-09-11", context({ dayRule: null }))).toBeNull();
  });
});

describe("devis", () => {
  it("additionne les jours et ajoute les frais de service", () => {
    const result = quote(["2026-09-11", "2026-09-12"], context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 150 000 (vendredi) + 195 000 (samedi majoré) = 345 000
    expect(result.subtotal.amount).toBe(345_000);
    expect(result.serviceFee.amount).toBe(34_500);
    expect(result.total.amount).toBe(379_500);
  });

  it("trie les dates, quel que soit l'ordre de sélection", () => {
    const result = quote(["2026-09-13", "2026-09-11", "2026-09-12"], context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.days.map((d) => d.date)).toEqual([
        "2026-09-11",
        "2026-09-12",
        "2026-09-13",
      ]);
    }
  });

  it("échoue franchement sur une date indisponible plutôt que de l'ignorer", () => {
    // Un total silencieusement amputé d'un jour serait pire qu'un refus.
    const result = quote(
      ["2026-09-11", "2026-09-14"],
      context({
        availabilities: [
          { date: "2026-09-11", status: "open", price: null },
          { date: "2026-09-14", status: "closed", price: null },
        ],
      }),
    );

    expect(result).toEqual({ ok: false, reason: "date-indisponible", date: "2026-09-14" });
  });

  it("refuse une date que le planning n'a pas ouverte", () => {
    // La recherche ne propose que les jours explicitement ouverts. Tarifer ici
    // une date absente du planning produirait un devis invendable : le
    // catalogue déclare l'annonce indisponible ce jour-là.
    const result = quote(["2026-09-11", "2026-09-20"], context());

    expect(result).toEqual({ ok: false, reason: "date-non-ouverte", date: "2026-09-20" });
  });

  it("continue d'afficher un tarif prévisionnel pour une date non ouverte", () => {
    // `priceForDate` garde le repli sur le tarif de base : c'est ce qui permet
    // au planning du partenaire d'afficher le tarif d'un jour non renseigné.
    // Seul `quote` — qui engage — refuse.
    const preview = priceForDate("2026-09-21", context()); // un lundi

    expect(preview?.amount.amount).toBe(150_000);
    expect(preview?.source).toBe("tarif-de-base");
  });

  it("échoue quand un jour n'a aucun tarif déterminable", () => {
    const result = quote(["2026-09-11"], context({ dayRule: null }));
    expect(result).toEqual({ ok: false, reason: "tarif-inconnu", date: "2026-09-11" });
  });

  it("refuse une sélection vide", () => {
    expect(quote([], context())).toEqual({ ok: false, reason: "aucune-date" });
  });

  it("garde des frais de service exacts sur un montant impair", () => {
    const result = quote(
      ["2026-09-11"],
      context({ availabilities: [{ date: "2026-09-11", status: "open", price: 100_005 }] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 10 % de 100 005 = 10 000,5 → arrondi au demi supérieur
    expect(result.serviceFee.amount).toBe(10_001);
    expect(result.total.amount).toBe(110_006);
    expect(result.subtotal.amount + result.serviceFee.amount).toBe(result.total.amount);
  });

  it("annonce le taux de frais appliqué", () => {
    expect(SERVICE_FEE_RATE).toBe(0.1);
  });

  it("formate un total lisible pour le marché béninois", () => {
    const result = quote(["2026-09-11", "2026-09-12"], context());
    if (!result.ok) throw new Error("devis inattendu");
    // `Intl` sépare les milliers par une espace insécable étroite (U+202F),
    // pas par une espace ordinaire — invisible à l'œil, décisif à l'égalité.
    expect(format(result.total)).toBe(`379${"\u202f"}500 FCFA`);
  });
});

describe("« à partir de »", () => {
  it("retient le jour ouvert le moins cher", () => {
    const cheapest = cheapestOpenDay(
      context({
        availabilities: [
          { date: "2026-09-11", status: "open", price: 150_000 },
          { date: "2026-09-12", status: "open", price: 195_000 },
          { date: "2026-09-10", status: "open", price: 120_000 },
        ],
      }),
    );
    expect(cheapest?.amount).toBe(120_000);
  });

  it("ignore les jours fermés, même moins chers", () => {
    const cheapest = cheapestOpenDay(
      context({
        availabilities: [
          { date: "2026-09-11", status: "open", price: 150_000 },
          { date: "2026-09-14", status: "closed", price: 50_000 },
        ],
      }),
    );
    expect(cheapest?.amount).toBe(150_000);
  });

  it("ne renvoie rien quand aucun jour n'est tarifé", () => {
    expect(cheapestOpenDay(context())).toBeNull();
  });
});

describe("options", () => {
  it("multiplie par les quantités", () => {
    const total = optionsTotal([
      { price: 25_000, quantity: 3 },
      { price: 15_000, quantity: 1 },
    ]);
    expect(total.amount).toBe(90_000);
  });

  it("vaut zéro sans option", () => {
    expect(optionsTotal([]).amount).toBe(0);
  });
});
