import "server-only";

import { hasBalance, paymentSchedule, splitPayment } from "@/lib/fees";
import { money, type CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Commandes et paiements, côté lecture.
 *
 * Aucune écriture ici : une commande naît d'un déclencheur, un paiement d'une
 * fonction `SECURITY DEFINER` (migration 0026). Ce module ne fait que présenter
 * ce que la base a décidé — y compris les montants, qu'il ne recalcule jamais
 * pour l'encaissement.
 *
 * `fees.ts` sert ici à **annoncer**, pas à décider : ce que le partenaire
 * touchera, ce qu'il reste à régler. Le montant réellement débité est celui
 * que `start_payment` déduit de la commande.
 */

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentPurpose = Database["public"]["Enums"]["payment_purpose"];

/** Formulation destinée aux utilisateurs — règle du projet : pas de jargon. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  deposit_paid: "Acompte réglé",
  paid: "Intégralement réglée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  deposit: "Acompte",
  balance: "Solde",
  full: "Paiement intégral",
};

export interface OrderView {
  id: string;
  reference: string;
  status: OrderStatus;
  statusLabel: string;
  currency: CurrencyCode;
  total: number;
  depositAmount: number;
  depositPercent: number;
  balanceAmount: number;
  /** Ce que le partenaire touchera sur le total, commission déduite. */
  partnerDue: number;
  commission: number;
  commissionRate: number;
  partnerName: string | null;
  eventDate: string | null;
  payments: PaymentView[];
  /** Nature qui reste à régler, ou `null` s'il n'y a plus rien à payer. */
  nextPurpose: PaymentPurpose | null;
  nextAmount: number;
}

export interface PaymentView {
  id: string;
  reference: string;
  purpose: PaymentPurpose;
  purposeLabel: string;
  amount: number;
  status: PaymentRow["status"];
  createdAt: string;
  paidAt: string | null;
}

function toView(
  order: OrderRow & { organizations: { brand_name: string | null; legal_name: string } | null },
  payments: PaymentRow[],
): OrderView {
  const currency = (order.currency as CurrencyCode) ?? "XOF";
  const total = money(order.total, currency);

  const echeancier = paymentSchedule(total, Number(order.deposit_percent));
  const partage = splitPayment(total, Number(order.commission_rate));

  const regles = new Set(payments.filter((p) => p.status === "paid").map((p) => p.purpose));

  // Ce qui reste à régler. Un acompte de 100 % ne laisse aucun solde : proposer
  // de payer zéro franc se lirait comme un bug.
  let nextPurpose: PaymentPurpose | null = null;
  let nextAmount = 0;

  if (order.status === "pending_payment" && !regles.has("deposit") && !regles.has("full")) {
    const integral = !hasBalance(echeancier);
    nextPurpose = integral ? "full" : "deposit";
    nextAmount = integral ? order.total : order.deposit_amount;
  } else if (order.status === "deposit_paid" && !regles.has("balance")) {
    nextPurpose = "balance";
    nextAmount = order.total - order.deposit_amount;
  }

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    currency,
    total: order.total,
    depositAmount: order.deposit_amount,
    depositPercent: Number(order.deposit_percent),
    balanceAmount: echeancier.balance.amount,
    partnerDue: partage.partnerDue.amount,
    commission: partage.commission.amount,
    commissionRate: Number(order.commission_rate),
    partnerName: order.organizations?.brand_name ?? order.organizations?.legal_name ?? null,
    eventDate: order.event_date,
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      purpose: p.purpose,
      purposeLabel: PURPOSE_LABELS[p.purpose],
      amount: p.amount,
      status: p.status,
      createdAt: p.created_at,
      paidAt: p.paid_at,
    })),
    nextPurpose,
    nextAmount,
  };
}

const SELECT =
  "id, reference, status, currency, total, deposit_amount, deposit_percent, commission_rate, event_date, quote_id, request_id, client_id, org_id, created_at, updated_at, paid_at, organizations(brand_name, legal_name)";

/** Commandes nées des devis acceptés sur une demande. */
export async function getOrdersForRequest(requestId: string): Promise<OrderView[]> {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (!orders || orders.length === 0) return [];

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .in(
      "order_id",
      orders.map((o) => o.id),
    )
    .order("created_at", { ascending: false });

  return orders.map((o) =>
    toView(
      o as unknown as Parameters<typeof toView>[0],
      ((payments ?? []) as PaymentRow[]).filter((p) => p.order_id === o.id),
    ),
  );
}

/** Une commande précise, telle que la RLS la laisse voir à l'appelant. */
export async function getOrder(orderId: string): Promise<OrderView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase.from("orders").select(SELECT).eq("id", orderId).maybeSingle();
  if (!order) return null;

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  return toView(order as unknown as Parameters<typeof toView>[0], (payments ?? []) as PaymentRow[]);
}

/** Retrouve un paiement par sa clé, pour la page de retour. */
export async function getPaymentByKey(key: string): Promise<PaymentRow | null> {
  const supabase = await createClient();

  const { data } = await supabase.from("payments").select("*").eq("idempotency_key", key).maybeSingle();
  return (data as PaymentRow | null) ?? null;
}
