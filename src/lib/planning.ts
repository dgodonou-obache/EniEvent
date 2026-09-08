import { addMonths, format as formatDate, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

import { buildMonthGrid, toKey } from "./calendar";
import {
  DEFAULT_CURRENCY,
  format as formatMoney,
  money,
  sum,
  type CurrencyCode,
  type Money,
} from "./money";
import { isWeekend, priceForDate, type AvailabilityRow, type DayRule } from "./pricing";

/**
 * Planning du partenaire : ouverture des dates et tarif au jour le jour.
 *
 * **Règle fondatrice — une date sans ligne n'est pas réservable.** Le catalogue
 * ne retient que les jours pour lesquels une ligne `open` existe (voir
 * `listingIdsAvailableBetween` dans `listings.ts`). Un planning vide rend donc
 * l'annonce introuvable dès qu'un client saisit des dates, même publiée et
 * tarifée. C'est pourquoi l'état « non renseigné » est affiché ici comme un
 * manque à combler, et non comme un état neutre.
 *
 * Le module est pur : il ne connaît ni Supabase ni React, et se teste sans
 * base ni composant.
 */

/** Le planning travaille à la journée. Les créneaux arrivent avec les devis. */
export const PLANNING_SLOT = "journee" as const;

/** Horizon d'ouverture proposé au partenaire. */
export const MONTHS_AHEAD = 12;

/** Garde-fou : au-delà, la saisie relève de l'erreur de manipulation. */
export const MAX_DATES_PER_EDIT = 366;

export type DayState = "unset" | "open" | "closed" | "booked";

export interface PlanningDay {
  date: Date;
  /** Clé `yyyy-MM-dd`, format d'échange avec la base. */
  key: string;
  state: DayState;
  /**
   * Tarif du jour, affiché même sur une date fermée : le partenaire doit voir
   * ce qu'il rouvrirait.
   */
  price: Money | null;
  priceSource: "planning" | "tarif-de-base" | null;
  isWeekend: boolean;
  isPast: boolean;
  /** Une date passée ou déjà réservée ne se modifie pas depuis le planning. */
  editable: boolean;
}

export interface PlanningContext {
  availabilities: readonly AvailabilityRow[];
  dayRule?: DayRule | null;
  currency?: CurrencyCode;
  /** Injectable pour rendre les tests déterministes. */
  today?: Date;
}

/**
 * Grille d'un mois, semaine commençant le lundi, chaque case décrite.
 * Les cases précédant le 1er sont `null` — même convention que `buildMonthGrid`.
 */
export function buildPlanningMonth(
  month: Date,
  context: PlanningContext,
): (PlanningDay | null)[] {
  const byDate = new Map(context.availabilities.map((row) => [row.date, row]));
  const today = context.today ?? new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return buildMonthGrid(month).map((date) =>
    date ? describeDay(date, byDate, context, startOfToday) : null,
  );
}

function describeDay(
  date: Date,
  byDate: Map<string, AvailabilityRow>,
  context: PlanningContext,
  startOfToday: Date,
): PlanningDay {
  const key = toKey(date);
  const row = byDate.get(key);
  const state: DayState = row ? row.status : "unset";

  // On force `open` avant d'appeler `priceForDate` : cette fonction refuse de
  // tarifer une date fermée, alors qu'ici on veut justement montrer le tarif
  // d'une date fermée. Réutiliser sa règle évite de réécrire la majoration
  // week-end — et d'en faire diverger la version du planning.
  const priced = priceForDate(key, {
    availabilities: row ? [{ ...row, status: "open" }] : [],
    dayRule: context.dayRule,
    currency: context.currency,
  });

  const isPast = date < startOfToday;

  return {
    date,
    key,
    state,
    price: priced?.amount ?? null,
    priceSource: priced?.source ?? null,
    isWeekend: isWeekend(key),
    isPast,
    editable: !isPast && state !== "booked",
  };
}

export interface PlanningSummary {
  open: number;
  closed: number;
  booked: number;
  unset: number;
  /** Recette du mois si toutes les dates ouvertes se réservaient. */
  potentialRevenue: Money;
}

/**
 * Compte les états du mois. Les dates passées sont exclues : elles ne se
 * modifient plus, les faire figurer dans un compteur d'action serait trompeur.
 */
export function summarizeMonth(
  cells: readonly (PlanningDay | null)[],
  currency: CurrencyCode = DEFAULT_CURRENCY,
): PlanningSummary {
  const days = cells.filter((cell): cell is PlanningDay => cell !== null && !cell.isPast);

  const openDays = days.filter((day) => day.state === "open");

  return {
    open: openDays.length,
    closed: days.filter((day) => day.state === "closed").length,
    booked: days.filter((day) => day.state === "booked").length,
    unset: days.filter((day) => day.state === "unset").length,
    potentialRevenue: sum(
      openDays.filter((day) => day.price !== null).map((day) => day.price as Money),
      currency,
    ),
  };
}

export type SelectionPreset = "mois" | "week-ends" | "semaine";

/**
 * Sélection en masse : c'est ce qui rend le planning utilisable. Ouvrir six
 * mois de samedis un jour à la fois ferait renoncer n'importe qui.
 * Ne retient que les dates modifiables — inutile de sélectionner du passé.
 */
export function presetSelection(
  cells: readonly (PlanningDay | null)[],
  preset: SelectionPreset,
): string[] {
  return cells
    .filter((cell): cell is PlanningDay => cell !== null && cell.editable)
    .filter((day) => {
      if (preset === "mois") return true;
      if (preset === "week-ends") return day.isWeekend;
      return !day.isWeekend;
    })
    .map((day) => day.key);
}

export type PlanningAction =
  /** Ouvrir à la réservation, en fixant éventuellement le tarif du jour. */
  | "open"
  /** Fermer : la date disparaît des résultats de recherche. */
  | "close"
  /** Retirer le tarif du jour pour revenir au tarif de base de l'annonce. */
  | "reset-price";

export const PLANNING_ACTIONS: readonly PlanningAction[] = ["open", "close", "reset-price"];

export function isPlanningAction(value: string): value is PlanningAction {
  return (PLANNING_ACTIONS as readonly string[]).includes(value);
}

export interface BulkEditInput {
  action: PlanningAction;
  dates: readonly string[];
  /** Unité mineure. `null` ou absent : ne pas toucher au tarif du jour. */
  price?: number | null;
}

export interface BulkEditGuard {
  /** Lignes déjà en base pour ces dates, pour repérer les réservations. */
  current: readonly AvailabilityRow[];
  /** Prix plancher de l'annonce, en unité mineure. */
  minPrice?: number | null;
  currency?: CurrencyCode;
  today?: Date;
}

export type BulkEditCheck = { ok: true; dates: string[] } | { ok: false; message: string };

/**
 * Contrôle d'une modification en masse, avant écriture.
 *
 * Le prix plancher est **aussi** vérifié en base par le déclencheur
 * `app.enforce_min_price` : c'est lui qui protège réellement, quelle que soit
 * la voie d'écriture. Le contrôle refait ici sert à formuler le refus en
 * français, chiffres à l'appui, plutôt que de renvoyer une erreur Postgres.
 */
export function validateBulkEdit(input: BulkEditInput, guard: BulkEditGuard): BulkEditCheck {
  const currency = guard.currency ?? DEFAULT_CURRENCY;
  const today = guard.today ?? new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const dates = [...new Set(input.dates)].sort();

  if (dates.length === 0) {
    return { ok: false, message: "Sélectionnez au moins une date." };
  }

  if (dates.length > MAX_DATES_PER_EDIT) {
    return {
      ok: false,
      message: `Vous ne pouvez pas modifier plus de ${MAX_DATES_PER_EDIT} dates à la fois.`,
    };
  }

  for (const date of dates) {
    if (!isValidDateKey(date)) {
      return { ok: false, message: "Une des dates sélectionnées est invalide." };
    }
    if (parseKey(date) < startOfToday) {
      return {
        ok: false,
        message: `Le ${dayLabel(date)} est passé : cette date ne peut plus être modifiée.`,
      };
    }
  }

  const booked = dates.find(
    (date) => guard.current.find((row) => row.date === date)?.status === "booked",
  );

  if (booked) {
    return {
      ok: false,
      message: `Le ${dayLabel(booked)} est déjà réservé. Passez par la réservation pour l'annuler.`,
    };
  }

  if (input.action === "open" && input.price != null) {
    const price = input.price;

    if (!Number.isInteger(price) || price < 0) {
      return { ok: false, message: "Le tarif doit être un nombre entier de francs." };
    }

    // Prix plancher, repris de la v1 : il protège le prestataire de sa propre
    // faute de frappe — 15 000 saisi pour 150 000.
    if (guard.minPrice != null && price < guard.minPrice) {
      return {
        ok: false,
        message:
          `Ce tarif est inférieur à votre prix plancher de ${formatMoney(money(guard.minPrice, currency))}. ` +
          `Abaissez le prix plancher dans l'annonce si vous voulez vraiment descendre en dessous.`,
      };
    }
  }

  return { ok: true, dates };
}

// -----------------------------------------------------------------------------
// Repères de temps
// -----------------------------------------------------------------------------

/** Bornes de navigation : du mois courant à l'horizon d'ouverture. */
export function monthBounds(today: Date = new Date()): { first: Date; last: Date } {
  const first = startOfMonth(today);
  return { first, last: addMonths(first, MONTHS_AHEAD) };
}

/** Ramène un mois dans les bornes navigables. */
export function clampMonth(month: Date, today: Date = new Date()): Date {
  const { first, last } = monthBounds(today);
  const target = startOfMonth(month);

  if (target < first) return first;
  if (target > last) return last;
  return target;
}

/** « septembre 2026 » — sans majuscule, c'est l'usage en français. */
export function monthLabel(month: Date): string {
  return formatDate(month, "LLLL yyyy", { locale: fr });
}

/** « vendredi 11 septembre », pour les messages destinés au partenaire. */
export function dayLabel(key: string): string {
  return formatDate(parseKey(key), "EEEE d MMMM", { locale: fr });
}

/** Fenêtre de chargement des disponibilités, en clés `yyyy-MM-dd`. */
export function planningWindow(today: Date = new Date()): { from: string; to: string } {
  const { last } = monthBounds(today);
  return {
    from: toKey(today),
    // Dernier jour du dernier mois navigable.
    to: toKey(new Date(last.getFullYear(), last.getMonth() + 1, 0)),
  };
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  // Rejette les dates qui n'existent pas : `2026-02-30` se replierait
  // silencieusement sur le 2 mars.
  return toKey(parseKey(key)) === key;
}

/** `yyyy-MM-dd` en date locale — `new Date("2026-09-12")` serait lue en UTC. */
function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
