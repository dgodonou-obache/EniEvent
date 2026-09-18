import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";

import type { EmailContent } from "@/lib/mail/resend";

import { shell } from "./shell";

/**
 * Rédaction des e-mails de notification.
 *
 * Pendant du SMS (`./messages.ts`), et soumis aux mêmes règles de fond : les
 * textes vivent ici et non en base, la file ne retient que **ce qui s'est
 * passé**. Mais la contrainte de forme est l'inverse.
 *
 * Le SMS tient en 160 caractères et coûte cher : il alerte, il ne raconte pas.
 * L'e-mail est gratuit et durable : il porte le détail qui évite au partenaire
 * de se connecter pour savoir si la demande le concerne — la ville, la date,
 * le nombre de convives, le budget, l'échéance. **C'est là tout l'intérêt de
 * doubler le canal** : sans ce détail, l'e-mail ne serait qu'un SMS plus lent.
 *
 * Ce module ne décide que **du texte**. La mise en page, l'échappement et la
 * variante texte vivent dans `./shell.ts`, partagé avec les e-mails
 * d'authentification — dont les gabarits sont gardés par Supabase.
 */

/** Le Bénin est à UTC+1 toute l'année. Sans cela, une échéance de 9 h du matin
 *  s'annoncerait à 8 h — et le client manquerait sa fenêtre. */
const TZ = "Africa/Porto-Novo";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Tronque une valeur venue de la base pour l'objet du message.
 *
 * Un titre de demande n'a aucune borne à la saisie. Placé tel quel dans un
 * objet, il chasse hors de l'aperçu la fin de la phrase — c'est-à-dire
 * l'information. Contrairement au SMS, les points de suspension typographiques
 * ne coûtent rien ici : l'objet n'est pas contraint à l'alphabet GSM.
 */
function short(value: unknown, max: number): string {
  const raw = text(value);
  return raw.length <= max ? raw : `${raw.slice(0, max - 1).trimEnd()}…`;
}

/** `2026-12-24` devient « 24 décembre 2026 ». Vide si la date est absente. */
function longDate(value: unknown): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return "";

  const parsed = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(parsed);
}

/** Un horodatage complet : « 24 décembre 2026 à 18:00 ». */
function dateTime(value: unknown): string {
  const raw = text(value);
  if (raw === "") return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(parsed);
}

/**
 * Montant en unité mineure vers « 150 000 FCFA ».
 *
 * Passe par `money.ts` — règle impérative du projet. Un montant non entier ou
 * une devise inconnue n'affiche rien plutôt qu'un chiffre faux : dans un
 * e-mail, un mauvais montant vaut pire qu'un montant absent.
 */
function amount(value: unknown, currency: unknown): string {
  if (typeof value !== "number" || !Number.isInteger(value)) return "";

  const code = text(currency) || DEFAULT_CURRENCY;
  try {
    return format(money(value, code as CurrencyCode));
  } catch {
    return "";
  }
}

function site(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * Contenu d'une notification par e-mail.
 * `null` pour un `kind` inconnu : la tâche planifiée le signalera plutôt que
 * d'envoyer un message vide — même contrat que `renderSms`.
 */
export function renderEmail(
  kind: string,
  payload: Record<string, unknown>,
  siteUrl: string,
): EmailContent | null {
  const base = site(siteUrl);
  const city = text(payload.city);
  const requestId = text(payload.requestId);
  const projet = requestId ? `${base}/projets/${requestId}` : base;

  switch (kind) {
    case "quote_request.new": {
      const titre = text(payload.title);
      return shell({
        subject: "Vous avez une nouvelle demande de devis",
        preheader: titre || "Un client cherche un prestataire.",
        heading: "Une demande de devis vous attend",
        intro:
          "Un client vient de publier une demande qui correspond à vos annonces. " +
          "Soyez le premier à répondre à cette demande pour décrocher le contrat.",
        details: [
          ["Demande", titre],
          ["Référence", text(payload.reference)],
          ["Ville", city],
          ["Date de l'événement", longDate(payload.eventDate)],
          ["Invités", typeof payload.guests === "number" ? `${payload.guests}` : ""],
          ["Budget indiqué", amount(payload.budgetMax, payload.currency)],
          ["À répondre avant le", dateTime(payload.respondBy)],
        ],
        cta: { label: "Voir la demande", href: `${base}/pro/demandes` },
        outro:
          "Vous ne pouvez pas répondre à cette demande ? Ignorez ce message, " +
          "elle sera attribuée à un autre prestataire.",
      });
    }

    case "quote.sent": {
      const partner = text(payload.partner);
      return shell({
        subject: partner ? `${partner} vous a envoyé un devis` : "Un devis vous attend",
        preheader: "Comparez les offres reçues avant de choisir.",
        heading: partner ? `${partner} a répondu à votre demande` : "Vous avez reçu un devis",
        intro:
          "Prenez le temps de comparer : le prix, ce qui est inclus, et la politique " +
          "d'annulation comptent autant les uns que les autres.",
        details: [
          ["Prestataire", partner],
          ["Montant proposé", amount(payload.amount, payload.currency)],
          ["Ville", city],
          ["Référence", text(payload.reference)],
        ],
        cta: { label: "Comparer les devis", href: projet },
      });
    }

    case "quote.accepted": {
      return shell({
        subject: "Vous avez un devis accepté",
        preheader: "Le client a retenu votre offre.",
        heading: "Vous avez un devis accepté",
        intro:
          "Le client a retenu votre offre. Retrouvez le détail de la prestation " +
          "et les prochaines étapes dans votre espace.",
        details: [
          ["Ville", city],
          ["Montant", amount(payload.amount, payload.currency)],
          ["Date de l'événement", longDate(payload.eventDate)],
          ["Référence", text(payload.reference)],
        ],
        cta: { label: "Voir le devis", href: `${base}/pro/devis` },
      });
    }

    case "quote.declined": {
      // Un refus se dit sans détour et sans reproche : le partenaire a
      // travaillé, il mérite de savoir plutôt que d'attendre, et de rester
      // engagé pour la demande suivante.
      // L'objet désigne la demande qui tombe : un partenaire qui a répondu à
      // trois appels d'offres cette semaine doit savoir lequel, sans ouvrir.
      // La référence prime — c'est l'identifiant qu'il retrouve dans son
      // espace et qu'il cite au téléphone. Le titre sert de repli : il est
      // toujours renseigné en base (`reference` est `not null`), mais la charge
      // utile vient d'un déclencheur et rien ne le garantit à l'exécution.
      // Le titre, lui, n'a aucune borne à la saisie — d'où la troncature.
      const nom = text(payload.reference) || short(payload.title, 26);

      return shell({
        subject: nom
          ? `Oups ! La demande « ${nom} » n'est plus disponible`
          : "Oups ! Cette demande n'est plus disponible",
        preheader: "Merci d'avoir pris le temps de répondre.",
        heading: "Cette fois, ce ne sera pas vous",
        intro:
          city
            ? `La demande à ${city} a été attribuée à un autre prestataire. Merci d'avoir pris le temps de répondre.`
            : "La demande a été attribuée à un autre prestataire. Merci d'avoir pris le temps de répondre.",
        details: [["Référence", text(payload.reference)]],
        cta: { label: "Voir les demandes ouvertes", href: `${base}/pro/demandes` },
        outro: "D'autres demandes arrivent chaque semaine dans votre espace.",
      });
    }

    case "request.deadline": {
      const offres = typeof payload.offres === "number" ? payload.offres : 0;

      // La référence désigne la demande concernée, comme dans l'objet d'un
      // refus : un client peut avoir plusieurs demandes ouvertes en même temps.
      // Elle est `not null` en base, mais la charge utile vient d'une tâche
      // planifiée — d'où la forme de repli.
      const ref = text(payload.reference);

      return shell({
        subject: ref
          ? `Rappel : Votre demande « ${ref} » arrive bientôt à échéance !`
          : "Rappel : Votre demande arrive bientôt à échéance !",
        preheader:
          offres > 1 ? `${offres} offres attendent votre décision.` : "Une offre attend votre décision.",
        // « quelque temps » est invariable dans cette expression : le pluriel
        // « quelques temps » est une faute répandue, et celle-ci partirait
        // dans de vrais e-mails clients.
        heading: "Plus que quelque temps pour comparer et valider un devis",
        intro:
          offres > 1
            ? `${offres} prestataires vous ont répondu. Passé l'échéance, la demande se ferme et les offres ne sont plus valables.`
            : "Un prestataire vous a répondu. Passé l'échéance, la demande se ferme et l'offre n'est plus valable.",
        details: [
          ["Offres reçues", `${offres}`],
          ["Ville", city],
          ["Échéance", dateTime(payload.respondBy)],
        ],
        cta: { label: "Comparer et décider", href: projet },
      });
    }

    default:
      return null;
  }
}
