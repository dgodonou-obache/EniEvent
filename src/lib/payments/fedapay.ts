import { isValidBeninPhone, normaliseBeninPhone } from "@/lib/validation/phone";

import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  PaymentState,
  ReadResult,
} from "./provider";

/**
 * Prestataire de paiement FedaPay (fedapay.com).
 *
 * **Seul fichier du dépôt à connaître ce prestataire**, comme `premux.ts` pour
 * les SMS et `resend.ts` pour le courrier. En changer ne touchera que lui.
 *
 * Particularités vérifiées contre l'API réelle, pas contre la documentation :
 *
 * 1. **Le XOF a une division de 1** (`GET /v1/currencies`). Les montants sont
 *    donc des francs entiers, et l'unité mineure de `money.ts` s'y verse sans
 *    conversion. Une devise à deux décimales exigerait une multiplication ici,
 *    et nulle part ailleurs.
 * 2. **Ouvrir un paiement demande deux appels.** `POST /transactions` crée la
 *    transaction mais ne rend aucune adresse ; c'est
 *    `POST /transactions/:id/token` qui produit la page. S'arrêter au premier
 *    laisse une transaction orpheline que personne ne pourra payer.
 * 3. **Le secret de signature des webhooks n'est pas exposé par l'API.** La
 *    création d'un webhook rend `id`, `url`, `enabled` — jamais le secret.
 *    D'où `readTransaction` : le webhook déclenche, la relecture prouve.
 * 4. **Le téléphone se donne en numéro national + pays**, pas en E.164. Le
 *    `+229` collé devant est refusé.
 */

const BASES = {
  sandbox: "https://sandbox-api.fedapay.com/v1",
  live: "https://api.fedapay.com/v1",
} as const;

export interface FedaPayConfig {
  secretKey: string;
  sandbox: boolean;
}

/**
 * Configuration lue dans l'environnement.
 * `null` plutôt qu'une exception : en développement sans clé, le tunnel doit
 * refuser proprement, pas rendre une page en erreur.
 */
export function fedapayConfig(): FedaPayConfig | null {
  const secretKey = process.env.FEDAPAY_SECRET_KEY;
  if (!secretKey) return null;

  // La clé porte son environnement : `sk_sandbox_…` ou `sk_live_…`. S'y fier
  // vaut mieux qu'une variable séparée, qu'on oublierait de basculer — et qui
  // enverrait des paiements réels vers le bac à sable, ou l'inverse.
  const sandbox = process.env.FEDAPAY_ENVIRONMENT
    ? process.env.FEDAPAY_ENVIRONMENT !== "live"
    : secretKey.startsWith("sk_sandbox");

  return { secretKey, sandbox };
}

/** Vocabulaire de FedaPay ramené au nôtre. */
export function toPaymentState(raw: string): PaymentState {
  switch (raw) {
    case "approved":
    case "transferred":
      return "paid";
    case "declined":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "pending":
    case "created":
    case "started":
      return "pending";
    default:
      // Un état inconnu n'est jamais « payé ». Un libellé nouveau chez le
      // prestataire ne doit pas valider un encaissement par défaut.
      return "pending";
  }
}

/**
 * Numéro au format attendu : national, avec le pays à part.
 * Renvoie `null` si le numéro est inexploitable — FedaPay accepte un client
 * sans téléphone, et un numéro faux vaut moins que pas de numéro.
 */
export function fedapayPhone(phone: string | null): { number: string; country: string } | null {
  if (!phone) return null;

  const canonical = normaliseBeninPhone(phone);

  // ⚠️ `normaliseBeninPhone` **préfixe `+229` à tout ce qu'elle ne reconnaît
  // pas** : un numéro ivoirien en ressort en `+229+2250700000001`, qui commence
  // bien par `+229`. Tester le préfixe ne prouve donc rien — seul le validateur
  // tranche. Même précaution que `premuxRecipient` dans `premux.ts`.
  if (!isValidBeninPhone(canonical)) return null;

  return { number: canonical.slice(4), country: "bj" };
}

interface Options {
  config?: FedaPayConfig | null;
  /** Injectable pour les tests : aucun appel réseau en suite de tests. */
  fetchImpl?: typeof fetch;
}

function createProvider(options: Options = {}): PaymentProvider {
  const config = options.config === undefined ? fedapayConfig() : options.config;
  const send = options.fetchImpl ?? fetch;
  const base = config?.sandbox === false ? BASES.live : BASES.sandbox;

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; detail: string }> {
    const response = await send(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config!.secretKey}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, detail: text.slice(0, 300) };

    try {
      return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
    } catch {
      return { ok: false, status: response.status, detail: `Réponse illisible : ${text.slice(0, 200)}` };
    }
  }

  return {
    name: "fedapay",
    sandbox: config?.sandbox ?? true,

    async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
      if (!config) {
        return {
          ok: false,
          reason: "non-configure",
          message: "FEDAPAY_SECRET_KEY manquante — aucun paiement n'a été ouvert",
        };
      }

      const telephone = fedapayPhone(request.customer.phone);

      try {
        const creation = await call("POST", "/transactions", {
          description: request.description,
          // Division de 1 en XOF : l'unité mineure de `money.ts` est le franc.
          amount: request.amount.amount,
          currency: { iso: request.amount.currency },
          callback_url: request.callbackUrl,
          // Retrouvés à la relecture : ils permettent de rattacher la
          // transaction sans jamais croire ce que le navigateur renvoie.
          merchant_reference: request.reference,
          custom_metadata: request.metadata,
          customer: {
            firstname: request.customer.firstName,
            lastname: request.customer.lastName,
            email: request.customer.email,
            ...(telephone ? { phone_number: telephone } : {}),
          },
        });

        if (!creation.ok) {
          return {
            ok: false,
            reason: creation.status >= 400 && creation.status < 500 ? "refus" : "passerelle",
            message: `HTTP ${creation.status} — ${creation.detail}`,
          };
        }

        const tx = creation.data["v1/transaction"] as Record<string, unknown> | undefined;
        const id = tx?.id;

        if (id === undefined || id === null) {
          return { ok: false, reason: "passerelle", message: "Transaction créée sans identifiant" };
        }

        // Second appel obligatoire : sans lui, la transaction existe mais
        // aucune page ne permet de la régler.
        const jeton = await call("POST", `/transactions/${id}/token`);

        if (!jeton.ok) {
          return {
            ok: false,
            reason: "passerelle",
            message: `Transaction ${id} ouverte, mais page indisponible — HTTP ${jeton.status} : ${jeton.detail}`,
          };
        }

        const url = jeton.data.url;
        if (typeof url !== "string" || url.length === 0) {
          return { ok: false, reason: "passerelle", message: "Aucune adresse de paiement rendue" };
        }

        return { ok: true, providerRef: String(id), url };
      } catch (error) {
        return {
          ok: false,
          reason: "passerelle",
          message: error instanceof Error ? error.message : "Erreur inconnue",
        };
      }
    },

    async webhookHealth() {
      if (!config) return null;

      try {
        const lecture = await call("GET", "/webhooks");
        if (!lecture.ok) return null;

        const liste = (lecture.data["v1/webhooks"] ?? []) as { url?: string; enabled?: boolean }[];

        return {
          total: liste.length,
          disabled: liste.filter((w) => w.enabled === false).map((w) => w.url ?? "(sans adresse)"),
        };
      } catch {
        return null;
      }
    },

    async readTransaction(providerRef: string): Promise<ReadResult> {
      if (!config) {
        return { ok: false, reason: "non-configure", message: "FEDAPAY_SECRET_KEY manquante" };
      }

      try {
        const lecture = await call("GET", `/transactions/${encodeURIComponent(providerRef)}`);

        if (!lecture.ok) {
          return {
            ok: false,
            reason: lecture.status === 404 ? "introuvable" : "passerelle",
            message: `HTTP ${lecture.status} — ${lecture.detail}`,
          };
        }

        const tx = lecture.data["v1/transaction"] as Record<string, unknown> | undefined;
        if (!tx) {
          return { ok: false, reason: "introuvable", message: "Transaction absente de la réponse" };
        }

        const rawStatus = typeof tx.status === "string" ? tx.status : "";

        return {
          ok: true,
          transaction: {
            providerRef: String(tx.id ?? providerRef),
            state: toPaymentState(rawStatus),
            rawStatus,
            amount: typeof tx.amount === "number" ? tx.amount : Number(tx.amount ?? 0),
            currency: "XOF",
            metadata: (tx.custom_metadata as Record<string, unknown>) ?? {},
          },
        };
      } catch (error) {
        return {
          ok: false,
          reason: "passerelle",
          message: error instanceof Error ? error.message : "Erreur inconnue",
        };
      }
    },
  };
}

/** Prestataire courant. Un seul aujourd'hui ; le contrat en admettra d'autres. */
export function paymentProvider(options: Options = {}): PaymentProvider {
  return createProvider(options);
}
