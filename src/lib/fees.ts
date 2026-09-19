import { type Money, MoneyError, percentage, subtract } from "@/lib/money";

/**
 * Ventilation de l'argent encaissé.
 *
 * Deux partages, et un seul principe : **une part est calculée, l'autre est le
 * reste**. Jamais les deux. Calculer la commission *et* la part du partenaire
 * chacune de son côté ferait diverger leur somme du total dès le premier
 * arrondi — un franc perdu par commande, invisible à la lecture, et qui
 * apparaît en comptabilité des mois plus tard.
 *
 * **Ce module double le SQL de la migration 0026**, comme `states.ts` double
 * les déclencheurs de `0009_devis.sql`. Ce n'est pas une redondance :
 * `start_payment` calcule la ventilation en base — c'est elle qui fait foi,
 * puisqu'un client ne doit jamais fournir un montant — tandis que l'interface
 * doit annoncer au partenaire ce qu'il touchera avant qu'il ne s'engage.
 * Toute divergence entre les deux est un bug, et `tests/fees.test.ts` compare
 * les deux formules.
 */

export interface Split {
  /** Ce que le client paie. */
  readonly gross: Money;
  /** Ce que garde ÉniEvent. */
  readonly commission: Money;
  /** Ce qui revient au partenaire. */
  readonly partnerDue: Money;
  /** Taux appliqué, en points de pourcentage. */
  readonly rate: number;
}

function assertRate(percent: number, nom: string): void {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`${nom} doit être compris entre 0 et 100 (reçu : ${percent}).`);
  }
}

/**
 * Partage un encaissement entre la plateforme et le partenaire.
 *
 * La commission porte sur **ce qui est réellement encaissé**, jamais sur le
 * total de la commande : un acompte réglé puis un solde jamais payé ne doit pas
 * valoir à la plateforme une commission sur de l'argent qu'elle n'a pas vu.
 */
export function splitPayment(gross: Money, ratePercent: number): Split {
  assertRate(ratePercent, "Un taux de commission");

  const commission = percentage(gross, ratePercent);
  // Le reste, et non un second calcul : c'est ce qui garantit l'égalité exacte.
  const partnerDue = subtract(gross, commission);

  return { gross, commission, partnerDue, rate: ratePercent };
}

export interface Schedule {
  readonly total: Money;
  /** Demandé à la réservation. */
  readonly deposit: Money;
  /** Le reste, dû avant la prestation. Nul si l'acompte vaut 100 %. */
  readonly balance: Money;
  readonly percent: number;
}

/**
 * Découpe une commande en acompte et solde.
 *
 * Le taux vient du partenaire (`partner_profiles.deposit_percent`) : un
 * traiteur n'engage pas les mêmes frais qu'un loueur de salle, et leur imposer
 * le même acompte serait arbitraire. 100 % signifie paiement intégral à la
 * réservation — le solde est alors nul, et aucun second encaissement n'est
 * proposé.
 */
export function paymentSchedule(total: Money, depositPercent: number): Schedule {
  assertRate(depositPercent, "Un acompte");

  const deposit = percentage(total, depositPercent);
  const balance = subtract(total, deposit);

  return { total, deposit, balance, percent: depositPercent };
}

/** Un solde nul ne se règle pas : l'interface ne doit pas l'offrir. */
export function hasBalance(schedule: Schedule): boolean {
  return schedule.balance.amount > 0;
}
