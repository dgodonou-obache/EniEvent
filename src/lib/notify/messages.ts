import { measureSms, toGsmSafe } from "@/lib/sms/segments";

/**
 * Rédaction des notifications.
 *
 * Les textes vivent ici, et non en base : une formulation se corrige, et des
 * messages figés à l'écriture laisseraient en file des phrases qu'on ne veut
 * plus envoyer. La file ne retient que **ce qui s'est passé** — un `kind` et
 * les quelques valeurs nécessaires.
 *
 * Contrainte permanente : **un segment**. Au-delà, chaque notification coûte
 * double. Les noms de partenaire et de ville viennent de la base et peuvent
 * être longs : ils sont donc tronqués, et un test éprouve le pire cas plutôt
 * que le cas moyen.
 */

export const KINDS = [
  "quote_request.new",
  "quote.sent",
  "quote.accepted",
  "quote.declined",
  "request.deadline",
] as const;
export type NotificationKind = (typeof KINDS)[number];

export function isKnownKind(value: string): value is NotificationKind {
  return (KINDS as readonly string[]).includes(value);
}

/** Au-delà, un nom d'enseigne mange la place du lien. */
const MAX_NAME = 24;

function short(value: unknown, max = MAX_NAME): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}.`;
}

/** `2026-12-24` devient `24/12`. L'année encombre pour rien : l'événement est proche. */
function shortDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : "";
}

function site(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * Texte d'une notification, déjà ramené à l'alphabet GSM.
 * `null` pour un `kind` inconnu : la tâche planifiée le signalera plutôt que
 * d'envoyer un message vide.
 */
export function renderSms(
  kind: string,
  payload: Record<string, unknown>,
  siteUrl: string,
): string | null {
  const base = site(siteUrl);

  switch (kind) {
    case "quote_request.new": {
      const city = short(payload.city, 20);
      const date = shortDate(payload.eventDate);
      const quand = date ? ` pour le ${date}` : "";

      // Les accents français courants — é, è, à — appartiennent à l'alphabet
      // GSM : les éviter n'économiserait rien et se lirait comme du dépannage.
      return toGsmSafe(
        `ÉniEvent : nouvelle demande de devis à ${city}${quand}. ` +
          `Répondez sur ${base}/pro/demandes`,
      );
    }

    case "quote.sent": {
      const partner = short(payload.partner);
      const auteur = partner ? `${partner} vous a envoyé un devis` : "Un devis vous attend";
      const lien = typeof payload.requestId === "string" ? `${base}/projets/${payload.requestId}` : base;

      return toGsmSafe(`ÉniEvent : ${auteur}. Comparez : ${lien}`);
    }

    case "quote.accepted": {
      const city = short(payload.city, 20);
      return toGsmSafe(
        `ÉniEvent : votre devis a été accepté${city ? ` pour ${city}` : ""} ! ` +
          `Détails sur ${base}/pro/devis`,
      );
    }

    case "quote.declined": {
      // Un refus se dit sans détour et sans reproche : le partenaire a travaillé,
      // il mérite de savoir plutôt que d'attendre, et de rester engagé pour la
      // prochaine demande.
      const city = short(payload.city, 20);
      return toGsmSafe(
        `ÉniEvent : la demande${city ? ` à ${city}` : ""} a été attribuée à un autre ` +
          `prestataire. Merci d'avoir répondu — d'autres suivront.`,
      );
    }

    case "request.deadline": {
      const offres = typeof payload.offres === "number" ? payload.offres : 0;
      const lien = typeof payload.requestId === "string" ? `${base}/projets/${payload.requestId}` : base;

      return toGsmSafe(
        `ÉniEvent : votre demande se termine bientôt. ` +
          `${offres > 1 ? `${offres} offres vous attendent` : "Une offre vous attend"} : ${lien}`,
      );
    }

    default:
      return null;
  }
}

/** Nombre de segments facturés pour un message déjà rendu. */
export function segmentsOf(body: string): number {
  return measureSms(body).segments;
}
