import { describe, expect, it } from "vitest";

import {
  canCancel,
  computeRefund,
  daysUntil,
  describeRefund,
  refundPercent,
  type CancellationRule,
} from "@/lib/cancellation";
import { add, format, money, MoneyError } from "@/lib/money";

/**
 * Annulation et remboursement.
 *
 * Deux familles de défauts, qu'aucun contrôle automatique ne voit.
 *
 * - **Un jour d'écart.** Le barème bascule de 100 % à 50 % sur une seule
 *   journée. Un calcul en heures locales, ou un arrondi dans le mauvais sens,
 *   fait perdre au client la moitié de son acompte — et il a raison de le
 *   contester.
 * - **Un franc perdu.** Ce qui est rendu et ce qui est retenu doivent faire
 *   exactement ce qui a été encaissé. Un écart d'une unité ne lève aucune
 *   erreur : il apparaît des mois plus tard, en comptabilité.
 */

const XOF = (n: number) => money(n, "XOF");

/** Les quatre barèmes de la migration 0003, tels qu'ils sont en base. */
const FLEXIBLE: CancellationRule[] = [
  { minDaysBefore: 7, refundPercent: 100 },
  { minDaysBefore: 0, refundPercent: 50 },
];

const MODEREE: CancellationRule[] = [
  { minDaysBefore: 30, refundPercent: 100 },
  { minDaysBefore: 7, refundPercent: 50 },
  { minDaysBefore: 0, refundPercent: 0 },
];

const NON_REMBOURSABLE: CancellationRule[] = [{ minDaysBefore: 0, refundPercent: 0 }];

const le = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("délai avant l'événement", () => {
  it("compte des jours pleins, quelle que soit l'heure", () => {
    // Le même jour civil doit donner le même nombre de jours à 6 h et à 23 h.
    // Sinon le barème bascule selon l'heure à laquelle le client ouvre la page.
    for (const heure of ["00:30", "06:00", "12:00", "23:45"]) {
      const on = new Date(`2026-09-20T${heure}:00Z`);
      expect(daysUntil("2026-10-01", on), heure).toBe(11);
    }
  });

  it("rend un nombre négatif après l'événement, et rien sans date", () => {
    expect(daysUntil("2026-09-19", le("2026-09-20"))).toBe(-1);
    expect(daysUntil(null, le("2026-09-20"))).toBeNull();
    expect(daysUntil("pas une date", le("2026-09-20"))).toBeNull();
  });
});

describe("lecture du barème", () => {
  it("bascule le bon jour, et pas la veille", () => {
    // C'est le test qui compte : la frontière est à 7 jours **inclus**.
    expect(refundPercent(FLEXIBLE, "2026-10-01", le("2026-09-24"))).toBe(100); // 7 jours
    expect(refundPercent(FLEXIBLE, "2026-10-01", le("2026-09-25"))).toBe(50); //  6 jours
  });

  it("retient la règle atteinte la plus exigeante", () => {
    expect(refundPercent(MODEREE, "2026-12-01", le("2026-09-20"))).toBe(100); // 72 jours
    expect(refundPercent(MODEREE, "2026-10-01", le("2026-09-20"))).toBe(50); //  11 jours
    expect(refundPercent(MODEREE, "2026-09-23", le("2026-09-20"))).toBe(0); //    3 jours
  });

  it("ne rembourse rien après l'événement", () => {
    // Aucune règle n'a de seuil négatif : une prestation rendue ne se
    // rembourse pas au barème, elle se discute comme un litige.
    expect(refundPercent(FLEXIBLE, "2026-09-19", le("2026-09-20"))).toBe(0);
    expect(refundPercent(MODEREE, "2026-01-01", le("2026-09-20"))).toBe(0);
  });

  it("applique le taux le plus favorable quand la date est inconnue", () => {
    // Retenir un délai dépassé qu'on ne sait pas prouver reviendrait à
    // facturer une pénalité au hasard.
    expect(refundPercent(MODEREE, null, le("2026-09-20"))).toBe(100);
    expect(refundPercent(FLEXIBLE, null, le("2026-09-20"))).toBe(100);
  });

  it("ne rembourse rien sans barème plutôt que de tout rembourser", () => {
    expect(refundPercent([], "2026-12-01", le("2026-09-20"))).toBe(0);
  });

  it("tient le barème non remboursable, même très en avance", () => {
    expect(refundPercent(NON_REMBOURSABLE, "2027-12-01", le("2026-09-20"))).toBe(0);
  });
});

describe("calcul du remboursement", () => {
  it("retombe exactement sur ce qui a été encaissé", () => {
    // Le test qui compte. Aucune combinaison ne doit perdre ni créer un franc,
    // ni entre le rendu et le retenu, ni dans la reprise de commission.
    for (const total of [1, 7, 333_333, 999_999, 1_234_567]) {
      for (const paid of [0, 1, 1000, 333_333, 999_999, 1_234_567]) {
        if (paid > total) continue;

        for (const percent of [0, 1, 33.33, 50, 66.67, 100]) {
          for (const rate of [0, 7.5, 10, 12.5, 100]) {
            const issue = computeRefund({
              total: XOF(total),
              paid: XOF(paid),
              percent,
              commissionRate: rate,
            });

            const contexte = `${paid}/${total} à ${percent} %, commission ${rate} %`;

            expect(add(issue.retained, issue.refunded).amount, contexte).toBe(paid);
            expect(add(issue.commissionBack, issue.partnerBack).amount, contexte).toBe(
              issue.refunded.amount,
            );
            expect(issue.refunded.amount, contexte).toBeGreaterThanOrEqual(0);
            expect(issue.retained.amount, contexte).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("ne retient jamais plus que ce qui est entré en caisse", () => {
    // Acompte de 30 % sur 200 000, barème ferme à 50 % : le prestataire aurait
    // « droit » à 100 000, mais seuls 60 000 ont été versés. La plateforme ne
    // réclame pas les 40 000 manquants — elle n'a aucun moyen de les recouvrer,
    // et une créance envoyée à un client qui annule ne serait jamais payée.
    const issue = computeRefund({
      total: XOF(200_000),
      paid: XOF(60_000),
      percent: 50,
      commissionRate: 10,
    });

    expect(issue.retained.amount).toBe(60_000);
    expect(issue.refunded.amount).toBe(0);
  });

  it("rend tout à 100 %, et rien à 0 %", () => {
    const tout = computeRefund({
      total: XOF(200_000),
      paid: XOF(60_000),
      percent: 100,
      commissionRate: 10,
    });
    expect(tout.refunded.amount).toBe(60_000);
    expect(tout.retained.amount).toBe(0);

    const rien = computeRefund({
      total: XOF(200_000),
      paid: XOF(60_000),
      percent: 0,
      commissionRate: 10,
    });
    expect(rien.refunded.amount).toBe(0);
    expect(rien.retained.amount).toBe(60_000);
  });

  it("rend la commission avec le remboursement", () => {
    // Garder la commission d'un règlement qu'on rend ferait gagner de l'argent
    // à la plateforme sur une annulation.
    const issue = computeRefund({
      total: XOF(100_000),
      paid: XOF(100_000),
      percent: 100,
      commissionRate: 10,
    });

    expect(issue.commissionBack.amount).toBe(10_000);
    expect(issue.partnerBack.amount).toBe(90_000);
  });

  it("refuse un taux hors de portée plutôt que d'inventer un montant", () => {
    for (const percent of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        computeRefund({ total: XOF(1000), paid: XOF(1000), percent, commissionRate: 10 }),
      ).toThrow(MoneyError);
    }
  });

  it("refuse de mélanger deux devises", () => {
    expect(() =>
      computeRefund({
        total: money(1000, "GHS"),
        paid: XOF(1000),
        percent: 50,
        commissionRate: 10,
      }),
    ).toThrow(MoneyError);
  });
});

describe("droit d'annuler", () => {
  it("refuse une réservation déjà annulée", () => {
    for (const status of ["cancelled", "refunded"]) {
      const out = canCancel({ status, eventEnd: "2026-12-01" }, le("2026-09-20"));
      expect(out.ok).toBe(false);
    }
  });

  it("refuse après la prestation, et l'accepte le jour même", () => {
    // Le jour de l'événement, il reste quelque chose à annuler ; le lendemain,
    // non — ce qui se discute alors est un litige.
    expect(canCancel({ status: "paid", eventEnd: "2026-09-20" }, le("2026-09-20")).ok).toBe(true);
    expect(canCancel({ status: "paid", eventEnd: "2026-09-19" }, le("2026-09-20")).ok).toBe(false);
  });

  it("accepte une commande sans date", () => {
    expect(canCancel({ status: "pending_payment", eventEnd: null }, le("2026-09-20")).ok).toBe(true);
  });
});

describe("formulation destinée au client", () => {
  it("dit la somme, jamais le taux à appliquer soi-même", () => {
    const issue = computeRefund({
      total: XOF(200_000),
      paid: XOF(200_000),
      percent: 50,
      commissionRate: 10,
    });

    const phrase = describeRefund(issue);

    // Comparé au rendu de `money.ts`, et non à une chaîne écrite à la main :
    // `Intl` sépare les milliers par une espace fine insécable, invisible à la
    // lecture d'un test mais différente d'une espace ordinaire.
    expect(phrase).toContain(format(XOF(100_000)));
    // Règle du projet : pas de jargon, et pas d'anglais technique.
    expect(phrase).not.toMatch(/%|policy|refund/i);
  });

  it("ne réclame rien quand rien n'a été réglé", () => {
    const issue = computeRefund({
      total: XOF(200_000),
      paid: XOF(0),
      percent: 0,
      commissionRate: 10,
    });

    expect(describeRefund(issue)).toContain("ne vous coûte rien");
  });
});
