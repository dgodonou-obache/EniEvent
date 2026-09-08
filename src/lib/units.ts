/**
 * Unités de facturation.
 *
 * Point unique de vérité, aligné sur l'énumération `price_unit` de la base.
 * Ces valeurs vivaient auparavant recopiées dans cinq fichiers — deux schémas
 * de validation, deux composants et un formulaire — avec trois formulations
 * différentes. Ajouter une unité obligeait à retrouver les cinq, et en oublier
 * une produisait soit un champ qui ne la propose pas, soit un libellé vide à
 * l'écran. `tests/units.test.ts` compare désormais cette liste à celle du SQL.
 *
 * Les trois jeux de libellés ne sont pas une redondance : une même unité ne se
 * dit pas pareil selon l'endroit.
 *   · formulaire      → « Par journée »          (en tête de phrase)
 *   · ligne de devis  → « 25 000 FCFA par personne »
 *   · fiche annonce   → « à partir de 150 000 FCFA la journée »
 */

export const PRICE_UNITS = [
  "day",
  "half_day",
  "hour",
  "person",
  "item",
  "square_meter",
  "forfait",
] as const;

export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Libellé d'option de formulaire, en tête de phrase. */
export const UNIT_FORM_LABELS: Record<PriceUnit, string> = {
  day: "Par journée",
  half_day: "Par demi-journée",
  hour: "Par heure",
  person: "Par personne",
  item: "À l'unité",
  square_meter: "Au mètre carré",
  forfait: "Au forfait",
};

/** Complément placé après un montant, dans le détail d'un devis. */
export const UNIT_LABELS: Record<PriceUnit, string> = {
  day: "par jour",
  half_day: "par demi-journée",
  hour: "par heure",
  person: "par personne",
  item: "à l'unité",
  square_meter: "par m²",
  forfait: "au forfait",
};

/** Complément placé après « à partir de X », sur une fiche ou une carte. */
export const UNIT_CATALOGUE_LABELS: Record<PriceUnit, string> = {
  day: "la journée",
  half_day: "la demi-journée",
  hour: "l'heure",
  person: "par personne",
  item: "l'unité",
  square_meter: "le m²",
  forfait: "au forfait",
};

/** Options d'un `<select>`, dans l'ordre de l'énumération. */
export const UNIT_OPTIONS = PRICE_UNITS.map((value) => ({
  value,
  label: UNIT_FORM_LABELS[value],
}));
