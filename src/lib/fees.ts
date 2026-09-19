import { add, type Money, MoneyError, money, percentage, subtract } from "@/lib/money";

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

export type ScheduleTrigger = "booking" | "before_event";
export type ScheduleAmountKind = "percent" | "fixed" | "balance";

/** Une ligne des conditions d'un partenaire. */
export interface ScheduleRow {
  label: string;
  trigger: ScheduleTrigger;
  /** Jours avant l'événement. Nul pour une échéance à la réservation. */
  daysBefore: number | null;
  amountKind: ScheduleAmountKind;
  percent: number | null;
  /** En unité mineure. */
  fixedAmount: number | null;
}

export interface Instalment {
  position: number;
  label: string;
  amount: Money;
  trigger: ScheduleTrigger;
  daysBefore: number | null;
  /** `YYYY-MM-DD`, ou `null` quand la date de l'événement n'est pas connue. */
  dueDate: string | null;
}

interface Dates {
  /** Date de l'événement, si elle est fixée. */
  eventDate?: string | null;
  /** Jour de la réservation. Passé explicitement : ce module reste pur. */
  bookingDate?: string | null;
}

function shiftDays(iso: string, days: number): string | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;

  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Déroule les conditions d'un partenaire sur un montant.
 *
 * **Double exact de `app.build_instalments`** (migration 0028), et pour la même
 * raison que `splitPayment` : la base fait foi — elle seule décide ce qui sera
 * débité — mais l'interface doit annoncer l'échéancier au client *avant* qu'il
 * ne s'engage, et au partenaire pendant qu'il le compose. Toute divergence est
 * un bug, et `tests/fees.test.ts` compare les deux.
 *
 * Trois règles portent tout le reste :
 *
 * - un **pourcentage porte sur le total**, jamais sur le reste : c'est la
 *   lecture intuitive, et la seule qu'un partenaire vérifie de tête ;
 * - un **montant fixe est plafonné** au reste, pour qu'un échéancier ne
 *   réclame jamais plus que la commande ;
 * - le **solde vaut ce qui reste**, et n'est donc jamais calculé — c'est ce qui
 *   rend la somme exacte quels que soient les arrondis.
 */
export function resolveSchedule(
  total: Money,
  rows: readonly ScheduleRow[],
  dates: Dates = {},
): Instalment[] {
  const instalments: Instalment[] = [];
  let reste = total.amount;

  for (const row of rows) {
    let montant: number;

    if (row.amountKind === "percent") {
      assertRate(row.percent ?? Number.NaN, "Un pourcentage d'échéance");
      montant = percentage(total, row.percent!).amount;
    } else if (row.amountKind === "fixed") {
      montant = Math.max(0, Math.trunc(row.fixedAmount ?? 0));
    } else {
      montant = reste;
    }

    if (montant > reste) montant = reste;
    // Une échéance nulle n'est pas créée : proposer de régler zéro franc se
    // lirait comme un défaut, pas comme une facilité.
    if (montant <= 0) continue;

    const dueDate =
      row.trigger === "booking"
        ? (dates.bookingDate ?? null)
        : dates.eventDate
          ? shiftDays(dates.eventDate, row.daysBefore ?? 0)
          : null;

    instalments.push({
      position: instalments.length,
      label: row.label,
      amount: money(montant, total.currency),
      trigger: row.trigger,
      daysBefore: row.daysBefore,
      dueDate,
    });

    reste -= montant;
  }

  // Échéancier vide ou entièrement à zéro : une commande doit rester réglable.
  if (instalments.length === 0 && total.amount > 0) {
    return [
      {
        position: 0,
        label: "Paiement intégral",
        amount: total,
        trigger: "booking",
        daysBefore: null,
        dueDate: dates.bookingDate ?? null,
      },
    ];
  }

  // Filet : un échéancier sans solde peut ne pas tout distribuer. Le reliquat
  // rejoint la dernière échéance plutôt que de disparaître.
  if (reste > 0 && instalments.length > 0) {
    const dernier = instalments[instalments.length - 1];
    instalments[instalments.length - 1] = {
      ...dernier,
      amount: add(dernier.amount, money(reste, total.currency)),
    };
  }

  return instalments;
}

/** Somme des échéances. Doit toujours valoir le total : un test le vérifie. */
export function scheduleTotal(instalments: readonly Instalment[], currency: Money["currency"]): Money {
  return instalments.reduce((acc, i) => add(acc, i.amount), money(0, currency));
}
