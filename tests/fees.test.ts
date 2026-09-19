import { describe, expect, it } from "vitest";

import { resolveSchedule, scheduleTotal, splitPayment, type ScheduleRow } from "@/lib/fees";
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

/** Raccourcis de composition, pour que les cas de test restent lisibles. */
const pct = (label: string, percent: number, daysBefore: number | null = null): ScheduleRow => ({
  label,
  trigger: daysBefore === null ? "booking" : "before_event",
  daysBefore,
  amountKind: "percent",
  percent,
  fixedAmount: null,
});

const fixe = (label: string, fixedAmount: number, daysBefore: number | null = null): ScheduleRow => ({
  label,
  trigger: daysBefore === null ? "booking" : "before_event",
  daysBefore,
  amountKind: "fixed",
  percent: null,
  fixedAmount,
});

const solde = (daysBefore = 7): ScheduleRow => ({
  label: "Solde",
  trigger: "before_event",
  daysBefore,
  amountKind: "balance",
  percent: null,
  fixedAmount: null,
});

describe("échéancier du partenaire", () => {
  it("déroule un acompte en pourcentage suivi du solde", () => {
    const e = resolveSchedule(XOF(1_500_000), [pct("Acompte", 30), solde()]);

    expect(e).toHaveLength(2);
    expect(e[0].amount.amount).toBe(450_000);
    expect(e[1].amount.amount).toBe(1_050_000);
  });

  it("accepte un montant fixe pour bloquer la date", () => {
    // Un traiteur qui demande 100 000 FCFA quel que soit le montant total.
    const e = resolveSchedule(XOF(1_500_000), [fixe("Réservation", 100_000), solde(15)]);

    expect(e[0].amount.amount).toBe(100_000);
    expect(e[1].amount.amount).toBe(1_400_000);
  });

  it("enchaîne plusieurs échéances", () => {
    const e = resolveSchedule(XOF(2_000_000), [
      fixe("Réservation", 150_000),
      pct("Deuxième versement", 25, 60),
      pct("Troisième versement", 25, 30),
      solde(7),
    ]);

    expect(e.map((x) => x.amount.amount)).toEqual([150_000, 500_000, 500_000, 850_000]);
  });

  it("retombe exactement sur le total, quels que soient les arrondis", () => {
    // Le test qui compte. Le solde n'est jamais calculé : il vaut le reste,
    // ce qui rend l'égalité vraie par construction — encore faut-il le prouver.
    const compositions: ScheduleRow[][] = [
      [pct("A", 30), solde()],
      [pct("A", 33.33), pct("B", 33.33, 30), solde()],
      [fixe("A", 99_999), pct("B", 12.5, 30), solde()],
      [pct("A", 1), pct("B", 7.5, 90), pct("C", 0.5, 60), solde(3)],
    ];

    for (const total of [1, 7, 999, 333_333, 1_234_567, 9_999_999]) {
      for (const rows of compositions) {
        const e = resolveSchedule(XOF(total), rows);

        expect(scheduleTotal(e, "XOF").amount, `${total} / ${rows.length} lignes`).toBe(total);
      }
    }
  });

  it("plafonne un montant fixe supérieur au total", () => {
    // Sans cela, un échéancier réclamerait plus cher que la commande.
    const e = resolveSchedule(XOF(80_000), [fixe("Réservation", 250_000), solde()]);

    expect(e).toHaveLength(1);
    expect(e[0].amount.amount).toBe(80_000);
  });

  it("n'écrit jamais une échéance de zéro franc", () => {
    // Proposer de régler zéro se lirait comme un défaut, pas comme une facilité.
    const e = resolveSchedule(XOF(500_000), [pct("Acompte", 0), solde()]);

    expect(e).toHaveLength(1);
    expect(e[0].label).toBe("Solde");
  });

  it("laisse une commande réglable même sans échéancier", () => {
    const e = resolveSchedule(XOF(500_000), []);

    expect(e).toHaveLength(1);
    expect(e[0].amount.amount).toBe(500_000);
    expect(e[0].label).toBe("Paiement intégral");
  });

  it("rattrape le reliquat d'un échéancier sans solde", () => {
    // 30 % + 30 % laisse 40 % que rien ne réclamerait : le reste rejoint la
    // dernière échéance plutôt que de disparaître.
    const e = resolveSchedule(XOF(1_000_000), [pct("A", 30), pct("B", 30, 30)]);

    expect(scheduleTotal(e, "XOF").amount).toBe(1_000_000);
    expect(e[1].amount.amount).toBe(700_000);
  });

  it("date les échéances depuis l'événement", () => {
    const e = resolveSchedule(XOF(1_000_000), [pct("Acompte", 30), solde(7)], {
      eventDate: "2026-12-24",
      bookingDate: "2026-09-19",
    });

    expect(e[0].dueDate).toBe("2026-09-19");
    expect(e[1].dueDate).toBe("2026-12-17");
  });

  it("n'invente pas de date quand l'événement n'en a pas encore", () => {
    // Une date souple est fréquente sur un mariage : afficher une échéance
    // calculée depuis rien tromperait le client.
    const e = resolveSchedule(XOF(1_000_000), [pct("Acompte", 30), solde(7)], {
      bookingDate: "2026-09-19",
    });

    expect(e[0].dueDate).toBe("2026-09-19");
    expect(e[1].dueDate).toBeNull();
  });

  it("refuse un pourcentage hors de portée", () => {
    expect(() => resolveSchedule(XOF(1000), [pct("A", 140), solde()])).toThrow(MoneyError);
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
