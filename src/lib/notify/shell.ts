import type { EmailContent } from "@/lib/mail/resend";

/**
 * Mise en page commune à tous les e-mails d'ÉniEvent.
 *
 * **Extrait dans son propre module pour servir deux appelants** : les
 * notifications (`./emails.ts`, expédiées par Resend depuis notre code) et les
 * e-mails d'authentification (`./auth-emails.ts`, dont Supabase garde les
 * gabarits et qu'il expédie lui-même). Sans ce partage, l'identité visuelle
 * vivrait à deux endroits et divergerait à la première retouche — c'est
 * exactement ainsi que le logo s'était retrouvé inversé dans les notifications
 * alors que le site, lui, était juste.
 *
 * Ce module n'importe **aucune valeur** hors de lui-même : son seul import est
 * un type, que Node efface au chargement. C'est ce qui permet à
 * `scripts/mails-auth.mjs` de le charger directement, sans étape de
 * compilation, et donc de pousser chez Supabase exactement ce que la suite de
 * tests vérifie.
 *
 * Trois contraintes propres au courrier, invisibles à la relecture :
 *
 * - **Tout ce qui vient de l'extérieur est échappé.** Un nom d'enseigne est une
 *   chaîne saisie par un partenaire ; concaténée telle quelle dans du HTML,
 *   c'est une injection. `esc()` n'est pas une politesse.
 * - **Styles en ligne, mise en page en tableaux.** Outlook ignore les feuilles
 *   de style et `flex` ; une mise en page moderne s'y effondre.
 * - **Une variante texte obligatoire.** Un message sans corps texte est noté
 *   comme indésirable par la plupart des filtres.
 */

/** Orange pêche et ardoise du système de conception, en valeurs littérales :
 *  un e-mail n'a pas accès aux jetons Tailwind. */
export const ORANGE = "#f97316";
export const SLATE_900 = "#0f172a";
export const SLATE_500 = "#64748b";
export const SLATE_100 = "#f1f5f9";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Une ligne du tableau récapitulatif. Les entrées vides sont écartées. */
export type Detail = readonly [label: string, value: string];

export interface Body {
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

export function shell(body: Body): EmailContent {
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
