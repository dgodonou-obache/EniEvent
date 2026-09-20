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

export interface PayoutBalance {
  /** Versable maintenant : plus aucun remboursement ne peut reprendre cet argent. */
  payable: number;
  /** Encaissé, mais retenu jusqu'à la prestation. */
  held: number;
}

/**
 * Ce qui attend d'être versé à un partenaire.
 *
 * **La règle de retenue n'est écrite qu'en SQL** (`pending_payout_amount`,
 * migration 0032), et c'est délibéré : c'est la même écriture qui sert à
 * `create_payout`. La rejouer ici ouvrirait la porte à deux réponses
 * différentes pour la même question — l'écran annoncerait une somme, le bouton
 * en verserait une autre.
 */
export async function getPendingPayoutAmount(orgId: string): Promise<PayoutBalance> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("pending_payout_amount", { org: orgId });
  const ligne = Array.isArray(data) ? data[0] : data;

  return { payable: ligne?.payable ?? 0, held: ligne?.held ?? 0 };
}

export interface PayoutCandidate {
  orgId: string;
  orgName: string;
  payable: number;
  held: number;
  currency: CurrencyCode;
  account: PayoutAccount | null;
}

/**
 * Partenaires à qui l'on doit de l'argent, pour l'administration.
 *
 * Ceux qui n'ont pas renseigné leurs coordonnées y figurent aussi, avec
 * `account: null` : les taire donnerait l'illusion qu'on ne leur doit rien.
 * Ceux dont tout est encore retenu y figurent également — un montant à zéro
 * assorti d'une date se comprend, une ligne absente se lit comme un oubli.
 */
export async function getPayoutCandidates(): Promise<PayoutCandidate[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("payout_candidates");
  const lignes = (data ?? []) as {
    org_id: string;
    org_name: string | null;
    currency: string | null;
    payable: number;
    held: number;
  }[];

  if (lignes.length === 0) return [];

  const { data: comptes } = await supabase
    .from("payout_accounts")
    .select("*")
    .in("org_id", lignes.map((l) => l.org_id));

  const parOrg = new Map((comptes ?? []).map((c) => [c.org_id, c as PayoutAccount]));

  return lignes
    .map((l) => ({
      orgId: l.org_id,
      orgName: l.org_name ?? "Partenaire",
      payable: l.payable,
      held: l.held,
      currency: (l.currency as CurrencyCode) ?? "XOF",
      account: parOrg.get(l.org_id) ?? null,
    }))
    .sort((a, b) => b.payable - a.payable || b.held - a.held);
}
