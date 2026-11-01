/**
 * Arithmétique monétaire d'ÉniEvent.
 *
 * Règle absolue : les montants circulent en **entiers, en unité mineure** de leur
 * devise. Jamais de `number` flottant — un acompte de 33 % sur 150 000 FCFA doit
 * tomber juste au franc près, et `0.1 + 0.2 !== 0.3` en IEEE 754.
 *
 * Le franc CFA (XOF) n'a pas de subdivision : son unité mineure est le franc
 * lui-même. Le cedi (GHS) et le naira (NGN) en ont deux. `MINOR_UNITS` porte
 * cette différence, et tout le reste du code n'a jamais à y penser.
 */

export type CurrencyCode = "XOF" | "GHS" | "NGN";

const MINOR_UNITS: Record<CurrencyCode, number> = {
  XOF: 0,
  GHS: 2,
  NGN: 2,
};

export const DEFAULT_CURRENCY: CurrencyCode = "XOF";

export interface Money {
  /** Montant en unité mineure. Toujours un entier. */
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Construit un montant à partir d'une valeur déjà exprimée en unité mineure. */
export function money(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  if (!Number.isInteger(amount)) {
    throw new MoneyError(
      `Montant non entier : ${amount}. Les montants doivent être exprimés en unité mineure.`,
    );
  }
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(`Montant hors des entiers sûrs : ${amount}.`);
  }
  return { amount, currency };
}

export function zero(currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return { amount: 0, currency };
}

export function isZero(m: Money): boolean {
  return m.amount === 0;
}

export function isNegative(m: Money): boolean {
  return m.amount < 0;
}

/**
 * Convertit une saisie en unité majeure (ce que tape un partenaire : « 150000 »
 * FCFA, « 49.90 » GHS) vers la représentation interne.
 */
export function fromMajor(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Valeur invalide : ${value}.`);
  }
  const factor = 10 ** MINOR_UNITS[currency];
  return money(roundHalfUp(value * factor), currency);
}

/** Repasse en unité majeure — pour l'affichage ou un export comptable uniquement. */
export function toMajor(m: Money): number {
  return m.amount / 10 ** MINOR_UNITS[m.currency];
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Devises incompatibles : ${a.currency} et ${b.currency}. La conversion doit être explicite.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  return items.reduce<Money>((acc, item) => add(acc, item), zero(currency));
}

/** Multiplie par une quantité entière (3 nuits, 12 chaises, 200 couverts). */
export function multiply(m: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`Quantité non entière : ${quantity}. Utilisez applyRate pour un ratio.`);
  }
  return money(m.amount * quantity, m.currency);
}

/**
 * Applique un taux (commission de 12 %, acompte de 30 %, majoration week-end
 * de 1,25). Le taux est le seul endroit où un flottant est toléré, et le
 * résultat est immédiatement ramené à l'entier.
 */
export function applyRate(m: Money, rate: number): Money {
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`Taux invalide : ${rate}.`);
  }
  return money(roundHalfUp(m.amount * rate), m.currency);
}

/** Applique un pourcentage exprimé en points (12.5 pour 12,5 %). */
export function percentage(m: Money, percent: number): Money {
  return applyRate(m, percent / 100);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

/** Borne un montant à zéro — une remise ne rend jamais un total négatif. */
export function clampToZero(m: Money): Money {
  return m.amount < 0 ? zero(m.currency) : m;
}

/**
 * Répartit un montant selon des poids, **sans perdre ni créer un seul franc**.
 *
 * Indispensable dès qu'on ventile : la commission d'une commande entre plusieurs
 * réservations, un acompte entre trois prestataires, un remboursement partiel
 * entre les lignes d'un devis. Une simple règle de trois arrondie ligne à ligne
 * laisse un reliquat ; ici les unités restantes sont distribuées une à une aux
 * plus gros poids, donc la somme des parts égale toujours le total.
 *
 * (Algorithme d'allocation de Fowler, *Patterns of Enterprise Application
 * Architecture*.)
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new MoneyError("Impossible de répartir sur une liste de poids vide.");
  }
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new MoneyError("Les poids de répartition doivent être finis et positifs.");
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight === 0) {
    throw new MoneyError("La somme des poids de répartition ne peut pas être nulle.");
  }

  const sign = m.amount < 0 ? -1 : 1;
  const absolute = Math.abs(m.amount);

  // Première passe : la part entière garantie de chacun (troncature).
  const shares = weights.map((w) => Math.floor((absolute * w) / totalWeight));
  let remainder = absolute - shares.reduce((acc, s) => acc + s, 0);

  // Seconde passe : les unités restantes vont aux plus gros poids, dans l'ordre,
  // ce qui rend la répartition déterministe et reproductible.
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  let cursor = 0;
  while (remainder > 0) {
    shares[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return shares.map((share) => money(share * sign, m.currency));
}

/**
 * Découpe un montant en un échéancier (acompte puis solde, ou N mensualités).
 * `ratios` doit sommer à 1 ; le solde absorbe l'éventuel reliquat d'arrondi.
 */
export function split(m: Money, ratios: readonly number[]): Money[] {
  const total = ratios.reduce((acc, r) => acc + r, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new MoneyError(`Les ratios doivent sommer à 1 (reçu : ${total}).`);
  }
  return allocate(m, [...ratios]);
}

/**
 * Nom d'usage d'une devise.
 *
 * ⚠️ **Un seul endroit sait que le XOF se dit « FCFA ».** La correspondance
 * vivait en dur dans `format`, et un en-tête de colonne qui veut annoncer
 * « Montant (FCFA) » l'aurait recopiée : deux endroits, et le jour où un
 * second pays arrive, l'un des deux ment.
 */
export function currencyLabel(currency: CurrencyCode): string {
  // Intl rend « XOF 150 000 » ; le marché lit « 150 000 FCFA ».
  return currency === "XOF" ? "FCFA" : currency;
}

/**
 * Formate pour l'affichage. En XOF on ne montre aucune décimale : « 150 000 FCFA ».
 *
 * `withCurrency: false` rend le seul nombre — pour une colonne de tableau dont
 * l'en-tête porte déjà la devise. ⚠️ Ce n'est légitime **que** si toutes les
 * lignes partagent la même devise : le schéma est multi-devise
 * (`organizations.country`), et une colonne « Montant (FCFA) » contenant une
 * ligne en GHS afficherait un montant faux sans qu'aucune erreur ne se produise.
 */
export function format(
  m: Money,
  options: { locale?: string; withCurrency?: boolean } = {},
): string {
  const { locale = "fr-FR", withCurrency = true } = options;
  const digits = MINOR_UNITS[m.currency];

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toMajor(m));

  if (!withCurrency) return formatted;

  return `${formatted} ${currencyLabel(m.currency)}`;
}

/**
 * Forme abrégée pour une case de calendrier : « 1,5k », « 150k », « 1,2 M ».
 *
 * ⚠️ **Ne jamais abréger vers zéro.** `Math.round(10 / 1000)` vaut `0`, et un
 * tarif de 10 francs s'affichait « 0k » dans le calendrier client — un prix qui
 * ne veut rien dire, sur une date pourtant réservable. En dessous du millier,
 * le montant s'écrit donc en entier : « 10 » est court, et vrai.
 *
 * ⚠️ **Et ne jamais abréger vers un _autre_ chiffre.** `Math.round(1500 / 1000)`
 * vaut `2` : une date saisie à **1 500 F s'affichait « 2k »**, dans le planning
 * du partenaire comme dans le calendrier du client. Signalé le 1er novembre
 * 2026 par un partenaire convaincu que le système avait changé son prix —
 * c'était faux, la base portait bien 1 500, mais la seule vue qu'il avait de sa
 * date disait autre chose. Un écart de 33 % sur un prix montré à un acheteur
 * n'est pas une abréviation, c'est un chiffre faux.
 *
 * Une décimale en dessous du dix-millier, donc — exactement la règle que la
 * branche des millions appliquait déjà, et pour la même raison. L'écart tombe
 * sous 5 % partout, et la case ne s'élargit que d'un caractère.
 */
export function abbreviate(m: Money): string {
  const major = toMajor(m);
  const abs = Math.abs(major);

  if (abs >= 1_000_000) {
    const millions = major / 1_000_000;
    // Une décimale en dessous de dix millions : « 1,2 M » reste lisible,
    // « 12,4 M » déborde d'une case.
    return `${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: abs < 10_000_000 ? 1 : 0,
    }).format(millions)} M`;
  }

  if (abs >= 1000) {
    const milliers = major / 1000;
    return `${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: abs < 10_000 ? 1 : 0,
    }).format(milliers)}k`;
  }

  return String(major);
}

/**
 * Arrondi au demi supérieur, symétrique autour de zéro.
 * `Math.round` arrondit vers +∞ (`Math.round(-0.5) === -0`), ce qui ferait
 * diverger un remboursement de son encaissement d'une unité.
 */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
