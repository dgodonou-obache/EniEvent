/**
 * Passerelle e-mail Resend (resend.com).
 *
 * **C'est le seul fichier du dépôt qui connaît ce fournisseur**, exactement
 * comme `src/lib/sms/premux.ts` pour les SMS. Le reste du code demande
 * « envoie ce message à cette adresse » et ignore tout du reste.
 *
 * Trois particularités de leur API, toutes sources de panne silencieuse :
 *
 * 1. **L'expéditeur doit appartenir à un domaine vérifié.** Un `from` non
 *    vérifié donne un `403` dont le libellé parle de domaine, pas de clé — on
 *    cherche alors du côté de l'authentification, au mauvais endroit. Voir
 *    `docs/DEPLOIEMENT.md` pour les enregistrements DNS.
 * 2. **Le champ de réponse s'appelle `reply_to`**, en serpent, là où le SDK
 *    expose `replyTo`. Passer la forme chameau à l'API REST ne lève rien : le
 *    champ est simplement ignoré, et les réponses des clients partent vers une
 *    adresse d'envoi que personne ne relève.
 * 3. **Deux requêtes par seconde.** Au-delà, `429`. Le drainage de la file
 *    traite jusqu'à 25 lignes d'affilée : sans cadencement, la moitié d'un lot
 *    serait rejetée. Le module s'auto-cadence donc (`MIN_INTERVAL_MS`), plutôt
 *    que de laisser cette connaissance fuir chez l'appelant.
 *
 * Comme pour les SMS, l'absence de clé ne lève pas : le développement local
 * journalise au lieu d'envoyer, et un envoi raté ne casse jamais l'action
 * métier qui l'a déclenché.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** 2 requêtes par seconde côté Resend. On garde une marge. */
export const MIN_INTERVAL_MS = 550;

export type EmailOutcome =
  | { ok: true; id: string; recipient: string }
  | {
      ok: false;
      reason: "adresse-invalide" | "message-vide" | "non-configure" | "passerelle";
      message: string;
    };

export interface EmailConfig {
  apiKey: string;
  /** Expéditeur complet, ex. `ÉniEvent <bonjour@enievent.com>`. */
  from: string;
  /**
   * Adresse à laquelle répondre. L'expéditeur est une adresse d'envoi que
   * personne ne relève ; sans cette valeur, la réponse d'un client se perd.
   */
  replyTo?: string;
}

/**
 * Adresse exploitable, en minuscules.
 *
 * Volontairement permissif : la seule validation qui compte est celle de la
 * boîte réceptrice, et refuser une adresse valide mais exotique serait pire
 * que de laisser la passerelle trancher. On écarte seulement ce qui ne peut
 * pas être une adresse — sans arobase, avec une espace, sans point au domaine.
 */
export function mailRecipient(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Configuration lue dans l'environnement.
 * `null` plutôt qu'une exception : voir l'en-tête du module.
 */
export function resendConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO || undefined };
}

export interface EmailContent {
  subject: string;
  html: string;
  /**
   * Variante texte. **Pas un supplément d'âme** : un message sans corps texte
   * est noté comme indésirable par la plupart des filtres, et illisible pour
   * qui lit son courrier en texte brut.
   */
  text: string;
}

interface SendOptions {
  config?: EmailConfig | null;
  /** Injectable pour les tests : aucun appel réseau n'est fait en suite de tests. */
  fetchImpl?: typeof fetch;
  /** Injectable pour les tests, qui ne doivent pas attendre le cadencement. */
  waitImpl?: (ms: number) => Promise<void>;
}

/** Horodatage du dernier appel, pour le cadencement. */
let lastCall = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Envoie un e-mail. Ne lève jamais : le résultat est toujours décrit par la
 * valeur de retour, pour que l'appelant journalise sans envelopper de `try`.
 */
export async function sendEmail(
  address: string,
  content: EmailContent,
  options: SendOptions = {},
): Promise<EmailOutcome> {
  const recipient = mailRecipient(address);
  if (!recipient) {
    return { ok: false, reason: "adresse-invalide", message: `Adresse inexploitable : ${address}` };
  }

  const subject = content.subject.trim();
  if (subject.length === 0 || content.html.trim().length === 0) {
    return { ok: false, reason: "message-vide", message: "Objet ou corps vide" };
  }

  const config = options.config === undefined ? resendConfig() : options.config;
  if (!config) {
    return {
      ok: false,
      reason: "non-configure",
      message: "RESEND_API_KEY ou EMAIL_FROM manquante — rien n'a été envoyé",
    };
  }

  const send = options.fetchImpl ?? fetch;
  const wait = options.waitImpl ?? sleep;

  // Cadencement : deux requêtes par seconde au maximum. Le drainage enchaîne
  // les envois sans reprendre son souffle, et un 429 coûterait une tentative.
  const since = Date.now() - lastCall;
  if (since < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - since);
  lastCall = Date.now();

  try {
    const response = await send(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipient],
        subject,
        html: content.html,
        text: content.text,
        // Serpent, et non chameau : la forme chameau est ignorée sans erreur.
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return { ok: false, reason: "passerelle", message: `HTTP ${response.status} — ${detail}` };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? "", recipient };
  } catch (error) {
    // Coupure réseau, DNS, délai dépassé : la passerelle est hors d'atteinte.
    return {
      ok: false,
      reason: "passerelle",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}
