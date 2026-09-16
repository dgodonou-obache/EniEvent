import { isValidBeninPhone, normaliseBeninPhone } from "@/lib/validation/phone";

import { measureSms, toGsmSafe } from "./segments";

/**
 * Passerelle SMS Premux (premux.bj).
 *
 * **C'est le seul fichier du dépôt qui connaît ce fournisseur.** Le reste du
 * code demande « envoie ce texte à ce numéro » et ignore tout du reste : en
 * changer plus tard ne touchera rien d'autre, exactement comme la couche de
 * paiement décrite dans `CLAUDE.md`.
 *
 * Deux particularités de leur API, toutes deux sources de panne silencieuse :
 *
 * 1. Le champ `to` attend `22901XXXXXXXX` — **sans le `+`**, alors que la base
 *    stocke la forme E.164 `+22901XXXXXXXX` (`normaliseBeninPhone`). Envoyer
 *    le `+` tel quel serait rejeté.
 * 2. L'authentification tient en **deux** en-têtes : le jeton porteur *et*
 *    `X-Premux-Domain`. Oublier le second donne une erreur d'autorisation qui
 *    ressemble à une clé invalide, et fait chercher au mauvais endroit.
 */

const ENDPOINT = "https://premux.bj/api/v1/messages/sms";

/** Au-delà, la passerelle découpe : le message coûte plusieurs SMS. */
export const MAX_SEGMENTS = 2;

export type SmsOutcome =
  | { ok: true; segments: number; recipient: string }
  | { ok: false; reason: "numero-invalide" | "message-vide" | "trop-long" | "non-configure" | "passerelle"; message: string };

/**
 * Destinataire au format attendu par Premux.
 * Renvoie `null` si le numéro n'est pas un numéro béninois valide — mieux vaut
 * ne rien envoyer qu'alimenter la passerelle en numéros qu'elle facturera
 * peut-être avant de les rejeter.
 */
export function premuxRecipient(phone: string): string | null {
  const canonical = normaliseBeninPhone(phone);
  if (!isValidBeninPhone(canonical)) return null;
  return canonical.slice(1); // retire le « + »
}

export interface PremuxConfig {
  apiKey: string;
  domain: string;
  senderId: string;
}

/**
 * Configuration lue dans l'environnement.
 *
 * Renvoie `null` plutôt que de lever : en développement, l'absence de clé doit
 * se traduire par « on journalise au lieu d'envoyer », pas par une page en
 * erreur. Un envoi raté ne doit jamais casser l'action métier qui l'a déclenché.
 */
export function premuxConfig(): PremuxConfig | null {
  const apiKey = process.env.PREMUX_API_KEY;
  const domain = process.env.PREMUX_DOMAIN;
  const senderId = process.env.PREMUX_SENDER_ID;

  if (!apiKey || !domain || !senderId) return null;
  return { apiKey, domain, senderId };
}

interface SendOptions {
  config?: PremuxConfig | null;
  /** Injectable pour les tests : aucun appel réseau n'est fait en suite de tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Envoie un SMS. Ne lève jamais : le résultat est toujours décrit par la valeur
 * de retour, pour que l'appelant puisse journaliser sans envelopper de `try`.
 */
export async function sendSms(
  phone: string,
  body: string,
  options: SendOptions = {},
): Promise<SmsOutcome> {
  const recipient = premuxRecipient(phone);
  if (!recipient) {
    return { ok: false, reason: "numero-invalide", message: `Numéro inexploitable : ${phone}` };
  }

  // Apostrophes courbes et guillemets français feraient basculer le message en
  // UCS-2, donc à 70 caractères par segment. On les remplace juste avant l'envoi.
  const text = toGsmSafe(body).trim();
  if (text.length === 0) {
    return { ok: false, reason: "message-vide", message: "Message vide" };
  }

  const measure = measureSms(text);
  if (measure.segments > MAX_SEGMENTS) {
    return {
      ok: false,
      reason: "trop-long",
      message: `${measure.segments} segments (${measure.encoding}) — maximum ${MAX_SEGMENTS}`,
    };
  }

  const config = options.config === undefined ? premuxConfig() : options.config;
  if (!config) {
    return {
      ok: false,
      reason: "non-configure",
      message: "PREMUX_API_KEY, PREMUX_DOMAIN ou PREMUX_SENDER_ID manquante — rien n'a été envoyé",
    };
  }

  const send = options.fetchImpl ?? fetch;

  try {
    const response = await send(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Premux-Domain": config.domain,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: recipient, body: text, senderId: config.senderId }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return { ok: false, reason: "passerelle", message: `HTTP ${response.status} — ${detail}` };
    }

    return { ok: true, segments: measure.segments, recipient };
  } catch (error) {
    // Coupure réseau, DNS, délai dépassé : la passerelle est hors d'atteinte.
    return {
      ok: false,
      reason: "passerelle",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}
