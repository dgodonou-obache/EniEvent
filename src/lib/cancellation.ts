import { format, type Money, MoneyError, percentage, subtract } from "@/lib/money";

/**
 * Annulation et remboursement.
 *
 * **Ce module double le SQL de la migration 0032**, comme `fees.ts` double
 * celui de la 0026 et `states.ts` les déclencheurs de la 0009. La base fait
 * foi — elle seule décide ce qui sera rendu — mais l'écran doit annoncer la
 * somme **avant** que le client ne confirme. Annoncer un montant que la base
 * corrigera ensuite est la meilleure façon de transformer une annulation en
 * litige. `tests/cancellation.test.ts` compare les deux formules.
 *
 * Deux règles portent tout le reste.
 *
 * - **Le barème porte sur le total, le remboursement sur ce qui a été payé.**
 *   « La moitié du montant reste due » décrit ce que le partenaire garde, pas
 *   ce qu'on rend. On retient donc `total × (100 − taux)`, **plafonné à ce qui
 *   est entré en caisse**, et on rend le reste. La plateforme ne réclame jamais
 *   de complément : elle n'a aucun moyen de le recouvrer.
 * - **Une part est calculée, l'autre est le reste** — même principe que
 *   `splitPayment`. La reprise se ventile exactement comme la prise, sans quoi
 *   un franc se perdrait à chaque annulation.
 */

/** Une ligne de `cancellation_rules` : « à partir de X jours avant, Y % ». */
export interface CancellationRule {
  minDaysBefore: number;
  refundPercent: number;
}

/**
 * Jours pleins entre deux dates civiles.
 *
 * Midi UTC des deux côtés : additionner des heures locales ferait basculer le
 * résultat d'un jour selon l'heure à laquelle le client ouvre la page — et un
 * jour, ici, vaut la différence entre 100 % et 50 % de remboursement.
 */
export function daysUntil(eventDate: string | null, on: Date = new Date()): number | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}/.test(eventDate)) return null;

  const event = Date.parse(`${eventDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(event)) return null;

  const today = Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate(), 12);
  return Math.round((event - today) / 86_400_000);
}

/**
 * Taux applicable, en points de pourcentage.
 *
 * Double de `app.refund_percent`. Deux cas limites comptent autant que le cas
 * courant :
 *
 * - **après l'événement, zéro** — aucune règle n'a de `minDaysBefore` négatif,
 *   et une prestation rendue ne se rembourse pas au barème ;
 * - **sans date, le taux le plus favorable** — retenir un délai dépassé qu'on
 *   ne sait pas prouver reviendrait à facturer une pénalité au hasard.
 */
export function refundPercent(
  rules: readonly CancellationRule[],
  eventDate: string | null,
  on: Date = new Date(),
): number {
  if (rules.length === 0) return 0;

  const restant = daysUntil(eventDate, on) ?? 36_500;

  const applicable = rules
    .filter((r) => r.minDaysBefore <= restant)
    .sort((a, b) => b.minDaysBefore - a.minDaysBefore)[0];

  return applicable?.refundPercent ?? 0;
}

export interface RefundOutcome {
  /** Taux retenu, en points de pourcentage. */
  readonly percent: number;
  /** Ce qui a réellement été encaissé. */
  readonly paid: Money;
  /** Ce que garde le partenaire, commission comprise. */
  readonly retained: Money;
  /** Ce qui revient au client. */
  readonly refunded: Money;
  /** Part de la commission rendue avec le remboursement. */
  readonly commissionBack: Money;
  /** Part du partenaire reprise sur le remboursement. */
  readonly partnerBack: Money;
}

/**
 * Ce que produit une annulation.
 *
 * `total` est le montant de la commande, `paid` ce qui en a été réglé. Les
 * deux diffèrent presque toujours : un acompte versé, un solde jamais appelé.
 */
export function computeRefund(params: {
  total: Money;
  paid: Money;
  percent: number;
  commissionRate: number;
}): RefundOutcome {
  const { total, paid, percent, commissionRate } = params;

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`Un taux de remboursement doit être compris entre 0 et 100 (reçu : ${percent}).`);
  }
  if (total.currency !== paid.currency) {
    throw new MoneyError(`Devises incompatibles : ${total.currency} et ${paid.currency}.`);
  }

  // Plafonné à ce qui est entré en caisse : au-delà, ce serait une créance sur
  // le client, et la plateforme n'en émet pas.
  const du = percentage(total, 100 - percent);
  const retained = du.amount > paid.amount ? paid : du;
  const refunded = subtract(paid, retained);

  // La commission suit le remboursement : garder la commission d'un règlement
  // qu'on rend ferait gagner de l'argent à la plateforme sur une annulation.
  const commissionBack = percentage(refunded, commissionRate);
  const partnerBack = subtract(refunded, commissionBack);

  return { percent, paid, retained, refunded, commissionBack, partnerBack };
}

/**
 * Une commande est-elle encore annulable ?
 *
 * Double de la garde de `cancel_order`. Proposer un bouton que la base
 * refusera ensuite est la meilleure façon de faire passer un produit pour
 * cassé — c'est la raison d'être de `states.ts`, et elle vaut ici.
 */
export type CancelRefusal = "deja-annulee" | "prestation-passee";

export function canCancel(
  order: { status: string; eventEnd: string | null },
  on: Date = new Date(),
): { ok: true } | { ok: false; reason: CancelRefusal; message: string } {
  if (order.status === "cancelled" || order.status === "refunded") {
    return { ok: false, reason: "deja-annulee", message: "Cette réservation est déjà annulée." };
  }

  const restant = daysUntil(order.eventEnd, on);

  if (restant !== null && restant < 0) {
    return {
      ok: false,
      reason: "prestation-passee",
      message: "Cette prestation a déjà eu lieu : contactez-nous pour toute contestation.",
    };
  }

  return { ok: true };
}

/**
 * Une prestation est-elle notable ?
 *
 * Double de `app.guard_review_eligibility` (migration 0048), pour la même
 * raison que `canCancel` : proposer un formulaire que la base refusera ensuite
 * fait passer un produit pour cassé. Les trois conditions sont celles du
 * déclencheur, dans le même ordre, et le message dit **quand** ce sera
 * possible plutôt que « non ».
 *
 * ⚠️ `order_status` ne dit nulle part qu'une prestation a eu lieu : la seule
 * notion de passé est calendaire. Une commande sans aucune date n'est donc
 * jamais notable — la base le refuse aussi, et pour la même raison.
 */
export type ReviewRefusal = "annulee" | "impayee" | "a-venir" | "sans-date";

export function canReview(
  order: { status: string; eventEnd: string | null; paidAmount: number },
  on: Date = new Date(),
): { ok: true } | { ok: false; reason: ReviewRefusal; message: string } {
  if (order.status === "cancelled" || order.status === "refunded") {
    return {
      ok: false,
      reason: "annulee",
      message: "Cette réservation a été annulée : la prestation n'a pas eu lieu.",
    };
  }

  if (order.paidAmount <= 0) {
    return {
      ok: false,
      reason: "impayee",
      message: "Vous pourrez donner votre avis une fois votre règlement encaissé.",
    };
  }

  const restant = daysUntil(order.eventEnd, on);

  if (restant === null) {
    return {
      ok: false,
      reason: "sans-date",
      message: "Cette réservation n'a pas encore de date : son avis n'est pas ouvert.",
    };
  }

  if (restant >= 0) {
    return {
      ok: false,
      reason: "a-venir",
      message: "Votre avis sera possible dès le lendemain de la prestation.",
    };
  }

  return { ok: true };
}

/**
 * Formulation destinée au client, avant confirmation.
 *
 * Règle du projet : pas de jargon, et pas de mauvaise surprise au moment de
 * payer — ni de rembourser. Le client doit lire la somme exacte, pas un taux
 * qu'il aurait à appliquer lui-même.
 */
export function describeRefund(outcome: RefundOutcome): string {
  if (outcome.paid.amount === 0) {
    return "Vous n'avez encore rien réglé : cette annulation ne vous coûte rien.";
  }

  if (outcome.refunded.amount === 0) {
    return "D'après les conditions de cette réservation, les sommes déjà versées restent acquises au prestataire.";
  }

  if (outcome.retained.amount === 0) {
    return "L'intégralité des sommes versées vous sera remboursée.";
  }

  return (
    `${format(outcome.refunded)} vous seront remboursés ; ` +
    `${format(outcome.retained)} restent acquis au prestataire.`
  );
}
