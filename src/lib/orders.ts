import "server-only";

import { splitPayment } from "@/lib/fees";
import { money, type CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Commandes, échéances et paiements, côté lecture.
 *
 * Aucune écriture ici : une commande et ses échéances naissent d'un
 * déclencheur, un paiement d'une fonction `SECURITY DEFINER` (migrations 0026
 * et 0028). Ce module ne fait que présenter ce que la base a décidé — il ne
 * recalcule jamais un montant à encaisser.
 *
 * `splitPayment` n'y sert qu'à **annoncer** ce que le partenaire touchera ; la
 * ventilation qui compte est celle inscrite sur chaque paiement.
 */

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type InstalmentRow = Database["public"]["Tables"]["order_instalments"]["Row"];

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Formulation destinée aux utilisateurs — règle du projet : pas de jargon. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  // Avec plusieurs échéances, « acompte réglé » serait faux dès la deuxième.
  deposit_paid: "Partiellement réglée",
  paid: "Intégralement réglée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export interface InstalmentView {
  id: string;
  position: number;
  label: string;
  amount: number;
  dueDate: string | null;
  paid: boolean;
  /** Un règlement ouvert mais pas encore confirmé. */
  pending: boolean;
  paidAt: string | null;
}

export interface OrderView {
  id: string;
  reference: string;
  status: OrderStatus;
  statusLabel: string;
  currency: CurrencyCode;
  total: number;
  /** Ce que le partenaire touchera sur le total, commission déduite. */
  partnerDue: number;
  commission: number;
  commissionRate: number;
  partnerName: string | null;
  eventDate: string | null;
  instalments: InstalmentView[];
  /** Somme déjà encaissée. */
  paidAmount: number;
  /** Première échéance non réglée — les échéances se règlent dans l'ordre. */
  next: InstalmentView | null;
}

function toView(
  order: OrderRow & { organizations: { brand_name: string | null; legal_name: string } | null },
  instalments: InstalmentRow[],
  payments: PaymentRow[],
): OrderView {
  const currency = (order.currency as CurrencyCode) ?? "XOF";
  const partage = splitPayment(money(order.total, currency), Number(order.commission_rate));

  const vues: InstalmentView[] = instalments
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => {
      const liees = payments.filter((p) => p.instalment_id === i.id);
      const regle = liees.find((p) => p.status === "paid");

      return {
        id: i.id,
        position: i.position,
        label: i.label,
        amount: i.amount,
        dueDate: i.due_date,
        paid: Boolean(regle),
        pending: !regle && liees.some((p) => p.status === "pending"),
        paidAt: regle?.paid_at ?? null,
      };
    });

  const paidAmount = vues.filter((v) => v.paid).reduce((total, v) => total + v.amount, 0);

  // La première non réglée, et elle seule : `start_payment` refuse d'ailleurs
  // qu'on saute une échéance.
  const next =
    order.status === "cancelled" || order.status === "refunded"
      ? null
      : (vues.find((v) => !v.paid) ?? null);

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    currency,
    total: order.total,
    partnerDue: partage.partnerDue.amount,
    commission: partage.commission.amount,
    commissionRate: Number(order.commission_rate),
    partnerName: order.organizations?.brand_name ?? order.organizations?.legal_name ?? null,
    eventDate: order.event_date,
    instalments: vues,
    paidAmount,
    next,
  };
}

const SELECT =
  "id, reference, status, currency, total, commission_rate, event_date, quote_id, request_id, client_id, org_id, created_at, updated_at, paid_at, organizations(brand_name, legal_name)";

async function hydrate(orders: unknown[]): Promise<OrderView[]> {
  if (orders.length === 0) return [];

  const supabase = await createClient();
  const ids = orders.map((o) => (o as OrderRow).id);

  const [{ data: instalments }, { data: payments }] = await Promise.all([
    supabase.from("order_instalments").select("*").in("order_id", ids),
    supabase.from("payments").select("*").in("order_id", ids),
  ]);

  return orders.map((o) => {
    const order = o as OrderRow;
    return toView(
      o as Parameters<typeof toView>[0],
      ((instalments ?? []) as InstalmentRow[]).filter((i) => i.order_id === order.id),
      ((payments ?? []) as PaymentRow[]).filter((p) => p.order_id === order.id),
    );
  });
}

/** Commandes nées des devis acceptés sur une demande. */
export async function getOrdersForRequest(requestId: string): Promise<OrderView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  return hydrate(data ?? []);
}

/** Une commande précise, telle que la RLS la laisse voir à l'appelant. */
export async function getOrder(orderId: string): Promise<OrderView | null> {
  const supabase = await createClient();

  const { data } = await supabase.from("orders").select(SELECT).eq("id", orderId).maybeSingle();
  if (!data) return null;

  const [vue] = await hydrate([data]);
  return vue ?? null;
}

/** Retrouve un paiement par sa clé, pour la page de retour. */
export async function getPaymentByKey(
  key: string,
): Promise<(PaymentRow & { order_instalments: { label: string } | null }) | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payments")
    .select("*, order_instalments(label)")
    .eq("idempotency_key", key)
    .maybeSingle();

  return (data as never) ?? null;
}
