import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  allocate,
  applyRate,
  clampToZero,
  format,
  fromMajor,
  money,
  multiply,
  percentage,
  split,
  subtract,
  sum,
  toMajor,
  zero,
} from "@/lib/money";

describe("construction", () => {
  it("refuse un montant non entier", () => {
    expect(() => money(1500.5)).toThrow(MoneyError);
  });

  it("traite le XOF sans décimale et le GHS avec deux", () => {
    expect(fromMajor(150_000, "XOF").amount).toBe(150_000);
    expect(fromMajor(49.9, "GHS").amount).toBe(4990);
  });

  it("fait l'aller-retour majeur/mineur sans perte", () => {
    expect(toMajor(fromMajor(49.9, "GHS"))).toBe(49.9);
    expect(toMajor(fromMajor(150_000, "XOF"))).toBe(150_000);
  });
});

describe("arithmétique", () => {
  it("additionne et soustrait", () => {
    expect(add(money(150_000), money(75_000)).amount).toBe(225_000);
    expect(subtract(money(150_000), money(75_000)).amount).toBe(75_000);
  });

  it("refuse de mélanger deux devises", () => {
    expect(() => add(money(1000, "XOF"), money(1000, "GHS"))).toThrow(MoneyError);
  });

  it("somme une liste vide à zéro", () => {
    expect(sum([]).amount).toBe(0);
  });

  it("multiplie par une quantité entière", () => {
    expect(multiply(money(25_000), 3).amount).toBe(75_000);
  });

  it("refuse une quantité fractionnaire", () => {
    expect(() => multiply(money(25_000), 1.5)).toThrow(MoneyError);
  });

  it("borne une remise excessive à zéro", () => {
    expect(clampToZero(subtract(money(10_000), money(15_000))).amount).toBe(0);
  });
});

describe("taux et pourcentages", () => {
  it("calcule une commission de 12 %", () => {
    expect(percentage(money(150_000), 12).amount).toBe(18_000);
  });

  it("arrondit au franc près", () => {
    // 33 % de 100 001 = 33 000,33 → 33 000
    expect(percentage(money(100_001), 33).amount).toBe(33_000);
    // 33 % de 100 005 = 33 001,65 → 33 002
    expect(percentage(money(100_005), 33).amount).toBe(33_002);
  });

  it("arrondit symétriquement autour de zéro", () => {
    // Un remboursement doit être l'exact miroir de l'encaissement.
    expect(applyRate(money(5), 0.1).amount).toBe(1);
    expect(applyRate(money(-5), 0.1).amount).toBe(-1);
  });

  it("applique une majoration week-end", () => {
    expect(applyRate(money(150_000), 1.25).amount).toBe(187_500);
  });
});

describe("répartition", () => {
  it("ne perd aucun franc sur une division inexacte", () => {
    const parts = allocate(money(100), [1, 1, 1]);
    expect(parts.map((p) => p.amount)).toEqual([34, 33, 33]);
    expect(sum(parts).amount).toBe(100);
  });

  it("ventile une commission au prorata de trois prestataires", () => {
    const parts = allocate(money(18_000), [150_000, 75_000, 25_000]);
    expect(sum(parts).amount).toBe(18_000);
    expect(parts.map((p) => p.amount)).toEqual([10_800, 5_400, 1_800]);
  });

  it("distribue le reliquat aux plus gros poids", () => {
    const parts = allocate(money(10), [7, 2, 1]);
    expect(sum(parts).amount).toBe(10);
    expect(parts[0].amount).toBeGreaterThanOrEqual(parts[1].amount);
  });

  it("reste exacte sur un montant négatif (remboursement)", () => {
    const parts = allocate(money(-100), [1, 1, 1]);
    expect(sum(parts).amount).toBe(-100);
  });

  it("refuse des poids tous nuls", () => {
    expect(() => allocate(money(100), [0, 0])).toThrow(MoneyError);
  });

  it("découpe un acompte de 30 % et son solde sans reliquat", () => {
    const [acompte, solde] = split(money(150_001), [0.3, 0.7]);
    expect(add(acompte, solde).amount).toBe(150_001);
  });

  it("refuse des ratios qui ne somment pas à 1", () => {
    expect(() => split(money(1000), [0.3, 0.3])).toThrow(MoneyError);
  });
});

describe("formatage", () => {
  it("affiche le XOF sans décimale et suffixé FCFA", () => {
    // Intl utilise l'espace insécable étroit comme séparateur de milliers.
    expect(format(money(150_000))).toBe("150 000 FCFA");
  });

  it("affiche le GHS avec deux décimales", () => {
    expect(format(money(4990, "GHS"))).toBe("49,90 GHS");
  });

  it("peut omettre la devise", () => {
    expect(format(zero(), { withCurrency: false })).toBe("0");
  });
});
