import "server-only";

import { canCancel, canReview } from "@/lib/cancellation";
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
  /**
   * Nom de l'annonce, figé à la commande (migration 0039).
   *
   * On réserve une salle, pas une société : c'est ce nom que le client cherche
   * dans sa liste. Nul pour une commande née d'un devis sans annonce visée —
   * l'interface retombe alors sur l'enseigne.
   */
  listingTitle: string | null;
  eventDate: string | null;
  /** Demande d'origine, pour une commande née d'un devis accepté. */
  requestId: string | null;
  /** Annonce d'origine, pour une réservation immédiate. */
  listingId: string | null;
  instalments: InstalmentView[];
  /** Somme déjà encaissée. */
  paidAmount: number;
  /** Première échéance non réglée — les échéances se règlent dans l'ordre. */
  next: InstalmentView | null;
  /** Dernier jour de la prestation : c'est lui qui dit si elle est passée. */
  endDate: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /**
   * Annulable aujourd'hui. Double de la garde de `cancel_order` : proposer un
   * bouton que la base refusera ensuite fait passer un produit pour cassé.
   */
  cancellable: boolean;
  /**
   * Notable aujourd'hui. Double de `app.guard_review_eligibility` : proposer
   * un formulaire que la base refusera fait passer un produit pour cassé.
   */
  reviewable: boolean;
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
    listingTitle: order.listing_title,
    eventDate: order.event_date,
    requestId: order.request_id,
    listingId: order.listing_id,
    instalments: vues,
    paidAmount,
    next,
    endDate: order.end_date,
    cancelledAt: order.cancelled_at,
    cancelReason: order.cancel_reason,
    cancellable: canCancel({
      status: order.status,
      eventEnd: order.end_date ?? order.event_date,
    }).ok,
    reviewable: canReview({
      status: order.status,
      eventEnd: order.end_date ?? order.event_date,
      paidAmount,
    }).ok,
  };
}

const SELECT =
  "id, reference, status, currency, total, commission_rate, event_date, start_date, end_date, quote_id, request_id, listing_id, client_id, org_id, created_at, updated_at, paid_at, cancelled_at, cancel_reason, listing_title, organizations(brand_name, legal_name)";

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

/** Commandes du client connecté. La RLS fait le filtrage. */
export async function getMyOrders(): Promise<OrderView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(SELECT)
    .order("created_at", { ascending: false });

  return hydrate(data ?? []);
}

/** Commandes reçues par un partenaire. */
export async function getPartnerOrders(orgId: string): Promise<OrderView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(SELECT)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return hydrate(data ?? []);
}

export interface MoneyLine {
  id: string;
  reference: string;
  amount: number;
  commission: number;
  partnerDue: number;
  currency: CurrencyCode;
  status: PaymentRow["status"];
  createdAt: string;
  paidAt: string | null;
  orderReference: string | null;
  instalmentLabel: string | null;
  /**
   * Motif de l'échec, tel que la relecture l'a constaté.
   *
   * ⚠️ **Ne s'affiche qu'à l'administration** (`PaymentTable showReason`). Un
   * client n'a que faire d'un code d'opérateur — `CLAUDE.md` §5 interdit le
   * jargon —, et un partenaire n'a pas à lire les déboires bancaires de son
   * client. C'est en revanche exactement ce qu'on cite au support de FedaPay.
   */
  lastError: string | null;
}

type PaymentJoined = PaymentRow & {
  orders: { reference: string } | null;
  order_instalments: { label: string } | null;
};

function toMoneyLine(p: PaymentJoined): MoneyLine {
  return {
    id: p.id,
    reference: p.reference,
    amount: p.amount,
    commission: p.commission,
    partnerDue: p.partner_due,
    currency: (p.currency as CurrencyCode) ?? "XOF",
    status: p.status,
    createdAt: p.created_at,
    paidAt: p.paid_at,
    orderReference: p.orders?.reference ?? null,
    instalmentLabel: p.order_instalments?.label ?? null,
    lastError: p.last_error,
  };
}

const PAYMENT_SELECT = "*, orders(reference), order_instalments(label)";

export interface Takings {
  /** Réellement encaissé. */
  collected: number;
  /** Ce qui revient au partenaire sur cet encaissement. */
  partnerDue: number;
  /** Ce que la plateforme a retenu. */
  commission: number;
  /** Ouvert mais pas encore confirmé. */
  pending: number;
  /** Échéances restant à régler sur les commandes en cours. */
  expected: number;
  currency: CurrencyCode;
}

/**
 * Agrégats d'un partenaire.
 *
 * **`collected` ne compte que les paiements `paid`.** Additionner les
 * échéances annoncerait un revenu que personne n'a versé — c'est le chiffre
 * qu'un partenaire lira en premier, et celui qu'il ne faut pas gonfler.
 */
export async function getPartnerTakings(orgId: string): Promise<{
  takings: Takings;
  lines: MoneyLine[];
}> {
  const supabase = await createClient();

  const [{ data: payments }, orders] = await Promise.all([
    supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .order("created_at", { ascending: false })
      .limit(200),
    getPartnerOrders(orgId),
  ]);

  const lines = ((payments ?? []) as PaymentJoined[]).map(toMoneyLine);
  const regles = lines.filter((l) => l.status === "paid");

  // Ce qui reste dû sur les commandes en cours : les échéances non réglées,
  // hors commandes annulées ou remboursées.
  const expected = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((total, o) => total + (o.total - o.paidAmount), 0);

  return {
    takings: {
      collected: regles.reduce((t, l) => t + l.amount, 0),
      partnerDue: regles.reduce((t, l) => t + l.partnerDue, 0),
      commission: regles.reduce((t, l) => t + l.commission, 0),
      pending: lines.filter((l) => l.status === "pending").reduce((t, l) => t + l.amount, 0),
      expected,
      currency: orders[0]?.currency ?? "XOF",
    },
    lines,
  };
}

/** Paiements visibles par l'appelant. La RLS décide du périmètre. */
export async function getPayments(limit = 200): Promise<MoneyLine[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PaymentJoined[]).map(toMoneyLine);
}

export const PAYMENT_STATUS_LABELS: Record<PaymentRow["status"], string> = {
  pending: "En attente",
  paid: "Encaissé",
  failed: "Échoué",
  cancelled: "Annulé",
  refunded: "Remboursé",
};

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
