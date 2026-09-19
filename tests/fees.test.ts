import { describe, expect, it } from "vitest";

import { hasBalance, paymentSchedule, splitPayment } from "@/lib/fees";
import { add, format, money, MoneyError } from "@/lib/money";

/**
 * Ventilation de l'argent.
 *
 * Ce qu'aucun contrôle automatique ne voit : **un franc perdu dans un
 * arrondi**. Il n'y a ni exception, ni test rouge, ni alerte — seulement un
 * écart en comptabilité, des mois plus tard, sur des milliers de commandes.
 *
 * D'où la forme de ces tests : ils vérifient moins « le bon chiffre » que
 * l'**égalité exacte** des parts avec le tout, sur des montants choisis pour
 * tomber mal.
 */

const XOF = (n: number) => money(n, "XOF");

describe("partage entre la plateforme et le partenaire", () => {
  it("garde la commission annoncée", () => {
    const s = splitPayment(XOF(1_000_000), 10);

    expect(s.commission.amount).toBe(100_000);
    expect(s.partnerDue.amount).toBe(900_000);
  });

  it("retombe exactement sur le total, même quand l'arrondi tombe mal", () => {
    // C'est le test qui compte. 12,5 % de 333 333 vaut 41 666,625 : quelle que
    // soit la façon d'arrondir, les deux parts doivent se rejoindre au franc.
    for (const brut of [1, 3, 7, 333_333, 999_999, 1_234_567, 2_500_001]) {
      for (const taux of [0, 1, 7.5, 10, 12.5, 33.33, 100]) {
        const s = splitPayment(XOF(brut), taux);

        expect(add(s.commission, s.partnerDue).amount, `${brut} à ${taux} %`).toBe(brut);
        expect(Number.isInteger(s.commission.amount)).toBe(true);
        expect(Number.isInteger(s.partnerDue.amount)).toBe(true);
      }
    }
  });

  it("ne prend rien à taux nul, et tout à 100 %", () => {
    expect(splitPayment(XOF(50_000), 0).commission.amount).toBe(0);
    expect(splitPayment(XOF(50_000), 0).partnerDue.amount).toBe(50_000);

    expect(splitPayment(XOF(50_000), 100).commission.amount).toBe(50_000);
    expect(splitPayment(XOF(50_000), 100).partnerDue.amount).toBe(0);
  });

  it("refuse un taux hors de portée plutôt que d'inventer un montant", () => {
    // Un taux négatif rendrait au partenaire plus que le client n'a payé.
    expect(() => splitPayment(XOF(1000), -1)).toThrow(MoneyError);
    expect(() => splitPayment(XOF(1000), 101)).toThrow(MoneyError);
    expect(() => splitPayment(XOF(1000), Number.NaN)).toThrow(MoneyError);
  });

  it("applique le taux à l'encaissement, pas au total de la commande", () => {
    // Un acompte réglé puis un solde jamais payé ne doit pas valoir à la
    // plateforme une commission sur de l'argent qu'elle n'a pas vu.
    const acompte = splitPayment(XOF(300_000), 10);

    expect(acompte.commission.amount).toBe(30_000);
  });
});

describe("acompte et solde", () => {
  it("découpe selon le taux choisi par le partenaire", () => {
    const e = paymentSchedule(XOF(1_500_000), 30);

    expect(e.deposit.amount).toBe(450_000);
    expect(e.balance.amount).toBe(1_050_000);
  });

  it("retombe exactement sur le total", () => {
    for (const total of [1, 999, 333_333, 1_234_567, 7_777_777]) {
      for (const pct of [0, 10, 25, 30, 33.33, 50, 100]) {
        const e = paymentSchedule(XOF(total), pct);

        expect(add(e.deposit, e.balance).amount, `${total} à ${pct} %`).toBe(total);
      }
    }
  });

  it("ne laisse aucun solde quand l'acompte vaut la totalité", () => {
    const e = paymentSchedule(XOF(800_000), 100);

    expect(e.deposit.amount).toBe(800_000);
    expect(e.balance.amount).toBe(0);
    // L'interface ne doit pas proposer de régler un solde nul.
    expect(hasBalance(e)).toBe(false);
  });

  it("n'exige rien d'avance quand le partenaire ne demande pas d'acompte", () => {
    const e = paymentSchedule(XOF(800_000), 0);

    expect(e.deposit.amount).toBe(0);
    expect(e.balance.amount).toBe(800_000);
  });

  it("refuse un acompte hors de portée", () => {
    expect(() => paymentSchedule(XOF(1000), -5)).toThrow(MoneyError);
    expect(() => paymentSchedule(XOF(1000), 120)).toThrow(MoneyError);
  });
});

describe("accord avec le calcul de la base", () => {
  it("reproduit exactement la formule de start_payment", () => {
    // La migration 0026 calcule `round(montant * taux / 100)` et déduit le
    // reste. Si les deux divergent, l'interface annonce au partenaire un
    // montant que la base ne lui versera pas — et personne ne le remarque
    // avant le premier virement contesté.
    const commeEnSql = (montant: number, taux: number) => {
      // `round()` de Postgres sur un numeric positif : au demi supérieur.
      const com = Math.round((montant * taux) / 100 + Number.EPSILON);
      return { commission: com, partnerDue: montant - com };
    };

    for (const montant of [1, 2, 3, 7, 101, 12_345, 333_333, 1_000_000, 9_999_999]) {
      for (const taux of [0, 5, 7.5, 10, 12.5, 15, 20, 100]) {
        const ts = splitPayment(XOF(montant), taux);
        const sql = commeEnSql(montant, taux);

        expect(ts.commission.amount, `${montant} à ${taux} %`).toBe(sql.commission);
        expect(ts.partnerDue.amount, `${montant} à ${taux} %`).toBe(sql.partnerDue);
      }
    }
  });
});

describe("lisibilité pour l'utilisateur", () => {
  it("formate les parts en francs, sans décimale", () => {
    const s = splitPayment(XOF(1_250_000), 10);

    expect(format(s.commission)).toMatch(/125\s000 FCFA/);
    expect(format(s.partnerDue)).toMatch(/1\s125\s000 FCFA/);
  });
});
