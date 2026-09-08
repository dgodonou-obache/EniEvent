/**
 * Machine à états des demandes de devis et des propositions.
 *
 * Ces tables **doublent** les déclencheurs de la migration `0009_devis.sql`.
 * Ce n'est pas une redondance inutile : la base *interdit*, l'application
 * *affiche les bons boutons*. Proposer une action que la base refusera ensuite
 * est la meilleure façon de faire passer un produit pour cassé.
 *
 * Toute divergence entre les deux est un bug. Les tests de `tests/states.test.ts`
 * comparent les transitions ci-dessous à celles écrites dans la migration.
 */

export type QuoteRequestStatus =
  | "draft"
  | "open"
  | "closed"
  | "awarded"
  | "cancelled"
  | "expired";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired";

export const REQUEST_TRANSITIONS: Record<QuoteRequestStatus, readonly QuoteRequestStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["closed", "awarded", "cancelled", "expired"],
  closed: ["open", "awarded", "cancelled"],
  awarded: [],
  cancelled: [],
  expired: [],
};

export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["accepted", "declined", "withdrawn", "expired"],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};

export function canTransitionRequest(from: QuoteRequestStatus, to: QuoteRequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

/**
 * L'acceptation passe obligatoirement par la fonction Postgres `accept_quote` :
 * elle refuse les offres rivales et attribue le besoin dans la même
 * transaction. Un UPDATE direct est refusé par la base.
 */
export const QUOTE_STATES_RESERVED_TO_SERVER: readonly QuoteStatus[] = ["accepted"];

// -----------------------------------------------------------------------------
// Formulation destinée aux utilisateurs
//
// Règle du projet : pas de jargon, et pas d'anglais technique. Un client ne lit
// pas « awarded », il lit « prestataires choisis ».
// -----------------------------------------------------------------------------

export const REQUEST_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  draft: "Brouillon",
  open: "En attente de devis",
  closed: "Devis clos",
  awarded: "Prestataires choisis",
  cancelled: "Annulée",
  expired: "Expirée",
};

/** Ce que le partenaire lit sur sa propre proposition. */
export const QUOTE_STATUS_LABELS_PARTNER: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  declined: "Non retenu",
  withdrawn: "Retiré",
  expired: "Expiré",
};

/** Ce que le client lit sur une proposition reçue. */
export const QUOTE_STATUS_LABELS_CLIENT: Record<QuoteStatus, string> = {
  draft: "Non reçu",
  sent: "Reçu",
  accepted: "Votre choix",
  declined: "Écarté",
  withdrawn: "Retiré par le prestataire",
  expired: "Expiré",
};

export function quoteLabel(status: QuoteStatus, audience: "partner" | "client"): string {
  return audience === "partner"
    ? QUOTE_STATUS_LABELS_PARTNER[status]
    : QUOTE_STATUS_LABELS_CLIENT[status];
}

// -----------------------------------------------------------------------------
// Délai de réponse
// -----------------------------------------------------------------------------

export type DeadlineState = "aucun" | "ouvert" | "urgent" | "depasse";

export interface Deadline {
  state: DeadlineState;
  hoursLeft: number | null;
  /** Formulation en clair, prête à afficher. */
  label: string;
}

/** En deçà, on alerte le partenaire : la demande lui échappe bientôt. */
export const URGENT_THRESHOLD_HOURS = 6;

/**
 * Traduit une date limite en phrase compréhensible. Le calcul est isolé ici
 * plutôt que dispersé dans les composants, parce qu'une heure d'écart change
 * le message affiché des deux côtés du marché.
 */
export function describeDeadline(respondBy: string | Date | null, now: Date = new Date()): Deadline {
  if (!respondBy) {
    return { state: "aucun", hoursLeft: null, label: "Sans date limite" };
  }

  const target = respondBy instanceof Date ? respondBy : new Date(respondBy);

  if (Number.isNaN(target.getTime())) {
    return { state: "aucun", hoursLeft: null, label: "Sans date limite" };
  }

  const hoursLeft = Math.floor((target.getTime() - now.getTime()) / 3_600_000);

  if (hoursLeft < 0) {
    return { state: "depasse", hoursLeft, label: "Délai de réponse dépassé" };
  }

  if (hoursLeft < 1) {
    return { state: "urgent", hoursLeft, label: "Moins d'une heure pour répondre" };
  }

  const label =
    hoursLeft < 24
      ? `${hoursLeft} h pour répondre`
      : `${Math.floor(hoursLeft / 24)} jour${hoursLeft >= 48 ? "s" : ""} pour répondre`;

  return {
    state: hoursLeft <= URGENT_THRESHOLD_HOURS ? "urgent" : "ouvert",
    hoursLeft,
    label,
  };
}

/** Une demande n'accepte de nouvelles offres que publiée et dans les délais. */
export function acceptsNewQuotes(
  status: QuoteRequestStatus,
  respondBy: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (status !== "open") return false;
  return describeDeadline(respondBy, now).state !== "depasse";
}
