import "server-only";

import { computeRefund, refundPercent, type CancellationRule } from "@/lib/cancellation";
import { money, type CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Remboursements, côté lecture.
 *
 * Aucune écriture ici : un remboursement naît de `cancel_order`, qui calcule
 * le montant depuis le barème figé sur la commande. Ce module ne fait que
 * présenter ce que la base a décidé.
 *
 * L'exception est `previewCancellation`, qui **annonce** ce qu'une annulation
 * produirait. Son résultat n'engage rien : il sert à écrire la phrase que le
 * client lit avant de confirmer. La somme qui fait foi est celle que la base
 * inscrira.
 */

type RefundRow = Database["public"]["Tables"]["refunds"]["Row"];

export type RefundStatus = Database["public"]["Enums"]["refund_status"];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: "À rembourser",
  sent: "Remboursé",
  failed: "Échoué",
  cancelled: "Annulé",
};

export interface RefundView {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string | null;
  amount: number;
  currency: CurrencyCode;
  percent: number;
  status: RefundStatus;
  statusLabel: string;
  reason: string | null;
  providerRef: string | null;
  note: string | null;
  /** Vrai quand une part de la somme rendue avait déjà été versée au partenaire. */
  needsRecovery: boolean;
  clientName: string | null;
  clientPhone: string | null;
  partnerName: string | null;
  createdAt: string;
  sentAt: string | null;
}

type RefundJoined = RefundRow & {
  orders: { reference: string } | null;
  profiles: { full_name: string | null; phone: string | null } | null;
  organizations: { brand_name: string | null; legal_name: string } | null;
};

function toView(r: RefundJoined): RefundView {
  return {
    id: r.id,
    reference: r.reference,
    orderId: r.order_id,
    orderReference: r.orders?.reference ?? null,
    amount: r.amount,
    currency: (r.currency as CurrencyCode) ?? "XOF",
    percent: Number(r.refund_percent),
    status: r.status,
    statusLabel: REFUND_STATUS_LABELS[r.status],
    reason: r.reason,
    providerRef: r.provider_ref,
    note: r.note,
    needsRecovery: r.needs_recovery,
    clientName: r.profiles?.full_name ?? null,
    clientPhone: r.profiles?.phone ?? null,
    partnerName: r.organizations?.brand_name ?? r.organizations?.legal_name ?? null,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

const SELECT =
  "*, orders(reference), profiles!refunds_client_id_fkey(full_name, phone), organizations(brand_name, legal_name)";

/** Remboursements visibles par l'appelant. La RLS décide du périmètre. */
export async function getRefunds(limit = 200): Promise<RefundView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("refunds")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as RefundJoined[]).map(toView);
}

export interface CancellationPreview {
  /** Taux applicable aujourd'hui, en points de pourcentage. */
  percent: number;
  /** Ce qui a déjà été encaissé. */
  paid: number;
  /** Ce qui serait rendu au client. */
  refunded: number;
  /** Ce qui resterait acquis au prestataire. */
  retained: number;
  /** Intitulé du barème, tel qu'il figure sur l'annonce. */
  policyName: string | null;
  /** Formulation en clair du barème, destinée au client. */
  policySummary: string | null;
}

/**
 * Ce qu'une annulation produirait, sans rien écrire.
 *
 * **Ne jamais laisser le client découvrir la retenue après coup.** Un
 * remboursement partiel qu'on n'a pas annoncé se lit comme un prélèvement
 * abusif, et c'est le premier motif de litige d'une place de marché.
 */
export async function previewCancellation(orderId: string): Promise<CancellationPreview | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    // Une seule chaîne littérale, et non une concaténation : l'inférence de
    // types de Supabase lit la requête à la compilation et ne sait rien faire
    // d'une expression.
    .select(
      "id, total, currency, commission_rate, event_date, end_date, cancellation_policy_id, cancellation_policies(name, summary)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const { data: rules } = await supabase
    .from("cancellation_rules")
    .select("min_days_before, refund_percent")
    .eq("policy_id", order.cancellation_policy_id ?? "");

  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .eq("order_id", orderId)
    .eq("status", "paid");

  const devise = (order.currency as CurrencyCode) ?? "XOF";
  const regle = (payments ?? []).reduce((total, p) => total + p.amount, 0);

  const bareme: CancellationRule[] = (rules ?? []).map((r) => ({
    minDaysBefore: r.min_days_before,
    refundPercent: Number(r.refund_percent),
  }));

  // La date de fin prime : sur une location de trois jours, c'est la dernière
  // qui dit si la prestation est passée.
  const jour = order.end_date ?? order.event_date;
  const percent = refundPercent(bareme, jour);

  const issue = computeRefund({
    total: money(order.total, devise),
    paid: money(regle, devise),
    percent,
    commissionRate: Number(order.commission_rate),
  });

  const politique = order.cancellation_policies as { name: string; summary: string } | null;

  return {
    percent,
    paid: issue.paid.amount,
    refunded: issue.refunded.amount,
    retained: issue.retained.amount,
    policyName: politique?.name ?? null,
    policySummary: politique?.summary ?? null,
  };
}
