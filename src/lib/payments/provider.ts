import type { Money } from "@/lib/money";

/**
 * Contrat des prestataires de paiement.
 *
 * Écrit avant le premier adaptateur, et volontairement plus étroit que ce que
 * FedaPay propose : le choix du prestataire n'est pas définitif, et un contrat
 * taillé sur les particularités de l'un se révèle inutilisable pour le suivant.
 * Ne figure ici que ce dont le tunnel a réellement besoin — ouvrir un
 * paiement, et relire son état.
 *
 * **`readTransaction` n'est pas un confort, c'est le pivot de la sécurité.**
 * Un webhook est un message non authentifié tant qu'on n'en vérifie pas la
 * signature, et le secret de signature de FedaPay n'est pas exposé par son API.
 * La règle est donc : le webhook déclenche, la relecture prouve. Rien n'est
 * encaissé sur la foi d'un corps de requête.
 */

/** États normalisés. Chaque adaptateur y ramène le vocabulaire de son API. */
export type PaymentState = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  /** Forme E.164 telle que stockée en base ; l'adaptateur la remet en forme. */
  phone: string | null;
}

export interface CheckoutRequest {
  /** Notre référence de paiement — retrouvée telle quelle à la relecture. */
  reference: string;
  amount: Money;
  description: string;
  customer: Customer;
  /** Où le prestataire renvoie le client une fois la page quittée. */
  callbackUrl: string;
  /** Recopié chez le prestataire : sert à corréler sans croire le client. */
  metadata: Record<string, string>;
}

export type CheckoutResult =
  | { ok: true; providerRef: string; url: string }
  | {
      ok: false;
      reason: "non-configure" | "refus" | "passerelle";
      message: string;
    };

export interface TransactionRead {
  providerRef: string;
  state: PaymentState;
  /** Libellé brut du prestataire, conservé pour le diagnostic. */
  rawStatus: string;
  /** Montant constaté, en unité mineure. Comparé au nôtre avant d'encaisser. */
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  /**
   * Motif de l'opérateur, quand il y en a un : `COULD_NOT_PERFORM_TRANSACTION`,
   * `NOT_ENOUGH_FUNDS`, `API_ERROR`…
   *
   * ⚠️ **Un code, jamais un texte.** Le message d'erreur brut de FedaPay
   * transporte la charge utile complète de l'opérateur — numéro du payeur
   * compris —, et `payments.last_error` est lisible par le **partenaire**
   * autant que par le client (`payments_select`, migration 0026). Y recopier
   * ce message publierait le numéro d'un client à son prestataire, en
   * contournant d'un coup tout le masquage des coordonnées de la messagerie.
   * L'adaptateur ne laisse donc passer que ce qui a la **forme** d'un code.
   */
  errorCode: string | null;
}

export type ReadResult =
  | { ok: true; transaction: TransactionRead }
  | {
      ok: false;
      reason: "non-configure" | "introuvable" | "passerelle";
      message: string;
    };

export interface PaymentProvider {
  /** Valeur écrite dans `payments.provider`. */
  readonly name: string;
  /** Vrai en bac à sable : l'interface doit le dire, un faux paiement se confond vite. */
  readonly sandbox: boolean;

  /** Ouvre un paiement et rend l'adresse de la page à présenter au client. */
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;

  /** Relit l'état chez le prestataire. Seule source de vérité. */
  readTransaction(providerRef: string): Promise<ReadResult>;

  /**
   * Les points de terminaison déclarés sont-ils encore actifs ?
   *
   * FedaPay **désactive** un webhook qui échoue de façon répétée, et ne nous en
   * informe que par courrier. C'est arrivé : quelques minutes d'indisponibilité
   * ont éteint le webhook, et plus rien n'arrivait sans qu'aucun écran ne le
   * montre. La tâche planifiée pose donc la question à chaque passage.
   *
   * ⚠️ **« Illisible » n'est pas « tout va bien ».** Cette fonction rendait
   * `null` en cas d'échec, et l'appelant comptait les désactivés : une liste
   * qu'on n'a pas pu lire donnait donc zéro, comme une liste saine. Trois
   * pannes distinctes — aucun webhook déclaré, API injoignable, clé fausse —
   * se présentaient toutes comme un succès. L'alarme destinée à révéler la
   * panne la plus sournoise du tunnel était elle-même silencieuse.
   */
  webhookHealth(): Promise<WebhookHealth>;
}

export type WebhookHealth =
  | { lisible: true; actifs: string[]; desactives: string[] }
  | { lisible: false; motif: string };
