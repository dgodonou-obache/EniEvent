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
}
