import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";

import type { EmailContent } from "@/lib/mail/resend";

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
 * Trois contraintes propres au courrier, invisibles à la relecture :
 *
 * - **Tout ce qui vient de la base est échappé.** Un nom d'enseigne est une
 *   chaîne saisie par un partenaire ; concaténée telle quelle dans du HTML,
 *   c'est une injection. `esc()` n'est pas une politesse.
 * - **Styles en ligne, mise en page en tableaux.** Outlook ignore les
 *   feuilles de style et `flex` ; une mise en page moderne s'y effondre.
 * - **Une variante texte obligatoire.** Un message sans corps texte est noté
 *   comme indésirable par la plupart des filtres.
 */

/** Orange pêche et ardoise du système de conception, en valeurs littérales :
 *  un e-mail n'a pas accès aux jetons Tailwind. */
const ORANGE = "#f97316";
const SLATE_900 = "#0f172a";
const SLATE_500 = "#64748b";
const SLATE_100 = "#f1f5f9";

/** Le Bénin est à UTC+1 toute l'année. Sans cela, une échéance de 9 h du matin
 *  s'annoncerait à 8 h — et le client manquerait sa fenêtre. */
const TZ = "Africa/Porto-Novo";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

/** Une ligne du tableau récapitulatif. Les entrées vides sont écartées. */
type Detail = readonly [label: string, value: string];

interface Body {
  subject: string;
  /** Résumé affiché par la boîte de réception avant l'ouverture. */
  preheader: string;
  heading: string;
  intro: string;
  details?: readonly Detail[];
  cta?: { label: string; href: string };
  /** Dernière phrase, sous le bouton. Facultative. */
  outro?: string;
}

function shell(body: Body): EmailContent {
  const details = (body.details ?? []).filter(([, value]) => value !== "");

  const rows = details
    .map(
      ([label, value]) => `
            <tr>
              <td style="padding:8px 0;color:${SLATE_500};font-size:14px;">${esc(label)}</td>
              <td style="padding:8px 0;color:${SLATE_900};font-size:14px;font-weight:600;text-align:right;">${esc(value)}</td>
            </tr>`,
    )
    .join("");

  const table =
    details.length === 0
      ? ""
      : `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SLATE_100};border-radius:16px;padding:16px 20px;margin:0 0 24px;">
            ${rows}
          </table>`;

  // Le bouton est centré par un `align="center"` sur une cellule, et non par
  // `margin:auto` : Outlook ignore les marges automatiques sur un tableau, et
  // le bouton y resterait collé à gauche sans que rien ne le signale.
  const button = body.cta
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:12px;background:${ORANGE};">
                      <a href="${esc(body.cta.href)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">${esc(body.cta.label)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`
    : "";

  const html = `<!-- ${esc(body.preheader)} -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(body.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;padding:40px 32px;">
        <tr>
          <td>
            <p style="margin:0 0 28px;font-size:18px;font-weight:800;color:${SLATE_900};letter-spacing:-0.3px;text-align:center;"><span style="color:${ORANGE};">Éni</span>Event</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${SLATE_900};">${esc(body.heading)}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${SLATE_500};">${esc(body.intro)}</p>
${table}${button}${body.outro ? `            <p style="margin:0;font-size:14px;line-height:1.6;color:${SLATE_500};">${esc(body.outro)}</p>` : ""}
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">ÉniEvent — réservation événementielle au Bénin<br />Vous recevez cet e-mail parce que vous utilisez ÉniEvent.</p>
    </td>
  </tr>
</table>`;

  const plain = [
    body.heading,
    "",
    body.intro,
    ...(details.length > 0 ? ["", ...details.map(([label, value]) => `${label} : ${value}`)] : []),
    ...(body.cta ? ["", `${body.cta.label} : ${body.cta.href}`] : []),
    ...(body.outro ? ["", body.outro] : []),
    "",
    "--",
    "ÉniEvent — réservation événementielle au Bénin",
  ].join("\n");

  return { subject: body.subject, html, text: plain };
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
        heading: "Plus que quelques temps pour comparer et valider un devis",
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
