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
  "order.cancelled",
  "message.new",
  "member.invited",
  "support.new",
  "review.received",
  "review.replied",
  "report.new",
  "dispute.opened",
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

    case "order.cancelled": {
      // Le destinataire est **l'autre partie** : celui qui annule le sait déjà.
      // Un partenaire prévenu la veille en consultant son planning a déjà
      // refusé d'autres clients pour cette date — d'où l'alerte immédiate.
      const pour = payload.pour === "partner" ? "partner" : "client";
      const ref = short(payload.reference, 20);
      const date = shortDate(payload.eventDate);
      const quand = date ? ` du ${date}` : "";

      return toGsmSafe(
        pour === "partner"
          ? `ÉniEvent : la réservation ${ref}${quand} a été annulée par le client. ` +
              `Détails : ${base}/pro/reservations`
          : `ÉniEvent : votre réservation ${ref}${quand} a été annulée par le prestataire. ` +
              `Détails : ${base}/compte/reservations`,
      );
    }

    case "message.new": {
      // ⚠️ Jamais le contenu du message. Le masquage des coordonnées vit dans
      // `read_conversation` ; un extrait ici le contournerait entièrement.
      const pour = payload.pour === "partner" ? "partner" : "client";
      const qui = short(payload.sender, 22);

      return toGsmSafe(
        `ÉniEvent : ${qui || "Un message"} vous a écrit. ` +
          `Répondez sur ${base}${pour === "partner" ? "/pro" : "/compte"}/messages`,
      );
    }

    case "member.invited": {
      // ⚠️ **Le jeton ne part jamais par SMS.** Il fait 64 caractères : à lui
      // seul il ferait exploser le segment, et surtout un lien d'invitation
      // recopié à la main depuis un écran de téléphone n'arrive jamais entier.
      // L'invitation vit par courriel ; ce texte n'existe que pour le jour
      // improbable où le canal SMS serait rebranché, et il renvoie au courriel.
      const org = short(payload.orgName, 22);

      return toGsmSafe(
        `ÉniEvent : ${org || "une structure"} vous invite à rejoindre son équipe. ` +
          `Le lien est dans le courriel que nous venons de vous envoyer.`,
      );
    }

    case "support.new": {
      // Destinataire : l'équipe, pas un utilisateur. Le sujet suffit à décider
      // s'il faut ouvrir tout de suite.
      const sujet = short(payload.subject, 40);

      return toGsmSafe(
        `ÉniEvent : nouveau message au support${sujet ? ` — ${sujet}` : ""}. ` +
          `À traiter sur ${base}/admin`,
      );
    }

    case "review.received": {
      // ⚠️ **Jamais le texte de l'avis.** Pas pour le masquer — un avis est
      // public — mais parce qu'un segment ne tient pas deux mille caractères,
      // et qu'un avis tronqué au milieu d'une phrase se lit à l'envers de ce
      // qu'il dit. La note, elle, tient en un chiffre.
      const note = typeof payload.rating === "number" ? payload.rating : 0;

      return toGsmSafe(
        `ÉniEvent : un client vous a noté ${note}/5. ` +
          `Vous pouvez répondre sur ${base}/pro/avis`,
      );
    }

    case "review.replied": {
      const partner = short(payload.partner);

      return toGsmSafe(
        `ÉniEvent : ${partner || "le prestataire"} a répondu à votre avis. ` +
          `À lire sur ${base}/compte/reservations`,
      );
    }

    case "report.new": {
      // Destinataire : l'équipe. Le motif ne tient pas dans un segment, et
      // c'est de toute façon à l'écran qu'on le lit pour trancher.
      const genre = payload.genre === "listing" ? "une annonce" : "un avis";

      return toGsmSafe(
        `ÉniEvent : ${genre} vient d'être signalé. ` +
          `À examiner sur ${base}/admin/signalements`,
      );
    }

    case "dispute.opened": {
      // ⚠️ Trois destinataires possibles, trois textes. Celui qui ouvre le
      // litige le sait déjà : il n'est jamais destinataire.
      const pour = payload.pour;
      const ref = short(payload.orderReference, 20);

      if (pour === "equipe") {
        return toGsmSafe(
          `ÉniEvent : litige ouvert sur ${ref}. À arbitrer sur ${base}/admin/litiges`,
        );
      }

      return toGsmSafe(
        pour === "partner"
          ? `ÉniEvent : un client conteste la réservation ${ref}. ` +
              `Donnez votre version sur ${base}/pro/reservations`
          : `ÉniEvent : le prestataire conteste la réservation ${ref}. ` +
              `Donnez votre version sur ${base}/compte/reservations`,
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
