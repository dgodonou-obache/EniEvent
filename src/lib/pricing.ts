import { getDay } from "date-fns";

import {
  add,
  applyRate,
  money,
  sum,
  zero,
  type CurrencyCode,
  type Money,
  DEFAULT_CURRENCY,
} from "./money";

/**
 * Calcul du prix d'une sélection de dates.
 *
 * Deux sources, dans cet ordre :
 *
 * 1. `availabilities` — le tarif que le prestataire a saisi jour par jour dans
 *    son planning. Il prime toujours : c'est sa décision explicite.
 * 2. `pricing_rules` — le tarif de base de l'annonce, majoré le week-end. Il ne
 *    sert que de repli, pour les dates non renseignées.
 *
 * Tout passe par `money.ts` : entiers en unité mineure, jamais de flottant.
 * Le taux de majoration week-end est le seul flottant toléré, et son résultat
 * est immédiatement ramené à l'entier.
 */

/** Frais de service acheteur. Provisoire : le barème réel arrive au lot 2. */
export const SERVICE_FEE_RATE = 0.1;

export type PriceSource = "planning" | "tarif-de-base";

export interface AvailabilityRow {
  /** Clé `yyyy-MM-dd`. */
  date: string;
  status: "open" | "closed" | "booked";
  /** Unité mineure. `null` quand le prestataire n'a pas fixé de tarif ce jour-là. */
  price: number | null;
}

export interface DayRule {
  basePrice: number;
  /** 1.25 = +25 % le samedi et le dimanche. */
  weekendMultiplier: number;
}

export interface PricingContext {
  availabilities: readonly AvailabilityRow[];
  dayRule?: DayRule | null;
  currency?: CurrencyCode;
}

export interface DayPrice {
  date: string;
  amount: Money;
  isWeekend: boolean;
  source: PriceSource;
}

export type QuoteResult =
  | { ok: true; days: DayPrice[]; subtotal: Money; serviceFee: Money; total: Money }
  | {
      ok: false;
      reason: "aucune-date" | "date-non-ouverte" | "date-indisponible" | "tarif-inconnu";
      date?: string;
    };

export function isWeekend(date: string): boolean {
  const day = getDay(parseKey(date));
  return day === 0 || day === 6;
}

/**
 * Tarif d'une journée, ou `null` si la date n'est pas réservable ou si aucun
 * tarif ne peut être déterminé — mieux vaut ne rien afficher qu'un prix faux.
 */
export function priceForDate(date: string, context: PricingContext): DayPrice | null {
  const currency = context.currency ?? DEFAULT_CURRENCY;
  const row = context.availabilities.find((a) => a.date === date);

  if (row && row.status !== "open") return null;

  if (row?.price != null) {
    return {
      date,
      amount: money(row.price, currency),
      isWeekend: isWeekend(date),
      source: "planning",
    };
  }

  if (!context.dayRule) return null;

  const weekend = isWeekend(date);
  const base = money(context.dayRule.basePrice, currency);

  return {
    date,
    amount: weekend ? applyRate(base, context.dayRule.weekendMultiplier) : base,
    isWeekend: weekend,
    source: "tarif-de-base",
  };
}

/**
 * Devis pour une sélection de dates. Échoue explicitement plutôt que d'ignorer
 * une date impossible à tarifer : un total silencieusement incomplet est pire
 * qu'un refus.
 *
 * Une date **sans ligne** de planning est refusée, et non tarifée au tarif de
 * base : la recherche ne retient que les jours explicitement ouverts
 * (`listingIdsAvailableBetween`), donc un devis accepté ici pour une date que
 * le catalogue déclare indisponible serait invendable. `priceForDate` garde le
 * repli sur le tarif de base — il sert à *afficher* un tarif prévisionnel,
 * jamais à engager une réservation.
 */
export function quote(dates: readonly string[], context: PricingContext): QuoteResult {
  const currency = context.currency ?? DEFAULT_CURRENCY;

  if (dates.length === 0) return { ok: false, reason: "aucune-date" };

  const days: DayPrice[] = [];

  for (const date of [...dates].sort()) {
    const row = context.availabilities.find((a) => a.date === date);
    if (!row) return { ok: false, reason: "date-non-ouverte", date };
    if (row.status !== "open") {
      return { ok: false, reason: "date-indisponible", date };
    }

    const priced = priceForDate(date, context);
    if (!priced) return { ok: false, reason: "tarif-inconnu", date };

    days.push(priced);
  }

  const subtotal = sum(
    days.map((d) => d.amount),
    currency,
  );
  const serviceFee = applyRate(subtotal, SERVICE_FEE_RATE);

  return { ok: true, days, subtotal, serviceFee, total: add(subtotal, serviceFee) };
}

/**
 * Tarif « à partir de » affiché au catalogue : le plus bas des jours ouverts.
 * Retombe sur `price_from`, dénormalisé en base, quand aucun planning n'est
 * chargé.
 */
export function cheapestOpenDay(context: PricingContext): Money | null {
  const currency = context.currency ?? DEFAULT_CURRENCY;

  const prices = context.availabilities
    .filter((a) => a.status === "open" && a.price != null)
    .map((a) => money(a.price as number, currency));

  if (prices.length === 0) return null;

  return prices.reduce((lowest, current) =>
    current.amount < lowest.amount ? current : lowest,
  );
}

/** Total des options choisies, quantités comprises. */
export function optionsTotal(
  options: readonly { price: number; quantity: number }[],
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Money {
  return options.reduce(
    (total, option) => add(total, money(option.price * option.quantity, currency)),
    zero(currency),
  );
}

/** `yyyy-MM-dd` en date locale — `new Date("2026-09-12")` serait interprétée en UTC. */
function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
