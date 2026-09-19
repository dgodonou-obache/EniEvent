import "server-only";

import type { CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Versements aux partenaires.
 *
 * **Ce qui reste à verser est une question posée à la base**, jamais un calcul
 * refait à l'écran : `payments.payout_id` dit si un encaissement a déjà été
 * rattaché à un versement. Recalculer ici ouvrirait la porte à payer deux fois
 * la même somme — l'erreur la plus coûteuse de toute la chaîne, et la plus
 * difficile à rattraper une fois l'argent parti.
 */

type PayoutRow = Database["public"]["Tables"]["payouts"]["Row"];
export type PayoutAccount = Database["public"]["Tables"]["payout_accounts"]["Row"];
export type PayoutMethod = Database["public"]["Enums"]["payout_method"];
export type PayoutStatus = Database["public"]["Enums"]["payout_status"];

export const METHOD_LABELS: Record<PayoutMethod, string> = {
  mtn: "MTN MoMo",
  moov: "Moov Money",
  celtiis: "Celtiis Cash",
  virement: "Virement bancaire",
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: "À envoyer",
  sent: "Envoyé",
  failed: "Échoué",
  cancelled: "Annulé",
};

export interface PayoutView {
  id: string;
  reference: string;
  amount: number;
  currency: CurrencyCode;
  method: PayoutMethod;
  methodLabel: string;
  phone: string | null;
  holderName: string;
  status: PayoutStatus;
  statusLabel: string;
  providerRef: string | null;
  note: string | null;
  createdAt: string;
  sentAt: string | null;
  orgName: string | null;
}

type PayoutJoined = PayoutRow & {
  organizations: { brand_name: string | null; legal_name: string } | null;
};

function toView(p: PayoutJoined): PayoutView {
  return {
    id: p.id,
    reference: p.reference,
    amount: p.amount,
    currency: (p.currency as CurrencyCode) ?? "XOF",
    method: p.method,
    methodLabel: METHOD_LABELS[p.method],
    phone: p.phone,
    holderName: p.holder_name,
    status: p.status,
    statusLabel: PAYOUT_STATUS_LABELS[p.status],
    providerRef: p.provider_ref,
    note: p.note,
    createdAt: p.created_at,
    sentAt: p.sent_at,
    orgName: p.organizations?.brand_name ?? p.organizations?.legal_name ?? null,
  };
}

const SELECT = "*, organizations(brand_name, legal_name)";

/** Versements visibles par l'appelant. La RLS décide du périmètre. */
export async function getPayouts(limit = 100): Promise<PayoutView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payouts")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PayoutJoined[]).map(toView);
}

/** Coordonnées de versement d'une organisation. */
export async function getPayoutAccount(orgId: string): Promise<PayoutAccount | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payout_accounts")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  return (data as PayoutAccount | null) ?? null;
}

/**
 * Ce qui attend d'être versé à un partenaire.
 *
 * Lit `payments` filtré sur `payout_id is null` — la base répond, on ne
 * recalcule rien.
 */
export async function getPendingPayoutAmount(orgId: string): Promise<number> {
  const supabase = await createClient();

  const { data: orders } = await supabase.from("orders").select("id").eq("org_id", orgId);
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length === 0) return 0;

  const { data } = await supabase
    .from("payments")
    .select("partner_due")
    .in("order_id", ids)
    .eq("status", "paid")
    .is("payout_id", null);

  return (data ?? []).reduce((total, p) => total + p.partner_due, 0);
}

export interface PayoutCandidate {
  orgId: string;
  orgName: string;
  amount: number;
  currency: CurrencyCode;
  account: PayoutAccount | null;
}

/**
 * Partenaires à qui l'on doit de l'argent, pour l'administration.
 *
 * Ceux qui n'ont pas renseigné leurs coordonnées y figurent aussi, avec
 * `account: null` : les taire donnerait l'illusion qu'on ne leur doit rien.
 */
export async function getPayoutCandidates(): Promise<PayoutCandidate[]> {
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("partner_due, currency, orders(org_id, organizations(brand_name, legal_name))")
    .eq("status", "paid")
    .is("payout_id", null);

  const parOrg = new Map<string, PayoutCandidate>();

  for (const p of (payments ?? []) as unknown as {
    partner_due: number;
    currency: string;
    orders: { org_id: string; organizations: { brand_name: string | null; legal_name: string } | null } | null;
  }[]) {
    const org = p.orders?.org_id;
    if (!org) continue;

    const existant = parOrg.get(org);
    if (existant) {
      existant.amount += p.partner_due;
      continue;
    }

    parOrg.set(org, {
      orgId: org,
      orgName: p.orders?.organizations?.brand_name ?? p.orders?.organizations?.legal_name ?? "Partenaire",
      amount: p.partner_due,
      currency: (p.currency as CurrencyCode) ?? "XOF",
      account: null,
    });
  }

  if (parOrg.size === 0) return [];

  const { data: comptes } = await supabase
    .from("payout_accounts")
    .select("*")
    .in("org_id", [...parOrg.keys()]);

  for (const compte of (comptes ?? []) as PayoutAccount[]) {
    const candidat = parOrg.get(compte.org_id);
    if (candidat) candidat.account = compte;
  }

  return [...parOrg.values()].sort((a, b) => b.amount - a.amount);
}
