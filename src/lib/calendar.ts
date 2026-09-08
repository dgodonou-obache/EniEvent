import { addDays, format, getDay, getDaysInMonth, isSameDay, startOfMonth } from "date-fns";

/**
 * Logique du calendrier, séparée de son affichage.
 *
 * Tout ce qui peut se tromper — le décalage du premier jour du mois, la
 * bascule d'une date déjà sélectionnée, l'ordre d'une plage saisie à l'envers —
 * vit ici et se teste sans monter de composant.
 */

export interface DateRange {
  from: Date;
  to?: Date;
}

/** Format d'échange avec la base : `availabilities.date` est une date nue. */
export const DATE_KEY = "yyyy-MM-dd";

export function toKey(date: Date): string {
  return format(date, DATE_KEY);
}

/**
 * Grille d'un mois, semaine commençant le lundi.
 *
 * Les cases précédant le 1er sont `null`. `date-fns` rend 0 pour dimanche,
 * alors que la semaine commence le lundi au Bénin — d'où le décalage.
 */
export function buildMonthGrid(month: Date): (Date | null)[] {
  const firstDay = getDay(startOfMonth(month));
  const leading = firstDay === 0 ? 6 : firstDay - 1;

  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);

  for (let day = 1; day <= getDaysInMonth(month); day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  return cells;
}

export interface AvailabilityOptions {
  /** Clés `yyyy-MM-dd` réservables. `undefined` = aucune restriction. */
  availableDates?: readonly string[];
  minDate?: Date;
  maxDate?: Date;
  /** Aujourd'hui, injectable pour rendre les tests déterministes. */
  today?: Date;
}

export function isSelectable(date: Date, options: AvailabilityOptions = {}): boolean {
  const { availableDates, minDate, maxDate, today = new Date() } = options;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (date < startOfToday) return false;

  if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) {
    return false;
  }
  if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) {
    return false;
  }

  if (availableDates && !availableDates.includes(toKey(date))) return false;

  return true;
}

/** Ajoute ou retire une date, en gardant la liste triée. */
export function toggleDate(selected: readonly Date[], date: Date): Date[] {
  const without = selected.filter((d) => !isSameDay(d, date));

  if (without.length !== selected.length) return without;

  return [...selected, date].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Fait avancer une plage au fil des clics : premier clic pose le début,
 * deuxième la fin, troisième recommence. Une fin antérieure au début est
 * réinterprétée comme un nouveau début — c'est ce que l'utilisateur veut dire.
 */
export function advanceRange(current: DateRange | undefined, date: Date): DateRange {
  if (!current || current.to) return { from: date };

  if (date < current.from) return { from: date };

  return { from: current.from, to: date };
}

export function isInRange(date: Date, range: DateRange | undefined): boolean {
  if (!range) return false;
  if (!range.to) return isSameDay(date, range.from);
  return date >= range.from && date <= range.to;
}

/** Toutes les dates d'une plage, bornes comprises. */
export function expandRange(range: DateRange): Date[] {
  if (!range.to) return [range.from];

  const dates: Date[] = [];
  for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

/**
 * Une plage n'est réservable que si *chaque* jour l'est. Un lieu fermé le lundi
 * ne peut pas être loué du samedi au mardi.
 */
export function isRangeSelectable(range: DateRange, options: AvailabilityOptions = {}): boolean {
  return expandRange(range).every((date) => isSelectable(date, options));
}
