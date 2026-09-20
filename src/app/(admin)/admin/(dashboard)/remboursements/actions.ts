"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Envoi des remboursements.
 *
 * Pendant exact de `versements/actions.ts`, et pour la même raison : FedaPay
 * refuse `/refunds` sur ce compte (401, là où `/transactions` répond 200 avec
 * la même clé). Le virement se fait donc par les moyens du bord et se consigne
 * ici.
 *
 * Le statut d'administrateur est revérifié dans `mark_refund_sent` : la
 * fonction est `SECURITY DEFINER` et contourne la RLS, donc le refus du proxy
 * ne suffirait pas à la protéger d'un appel direct.
 */

export interface RefundState {
  message?: string;
  ok?: boolean;
}

export async function markRefundSent(
  _previous: RefundState,
  formData: FormData,
): Promise<RefundState> {
  await requireUser("/admin/connexion");

  const refundId = String(formData.get("refundId") ?? "");
  const reference = String(formData.get("providerRef") ?? "").trim();

  if (!refundId) return { message: "Remboursement introuvable." };

  // Même exigence que pour un versement : sans référence, « remboursé » n'est
  // qu'une affirmation, et un client qui conteste a raison de s'en méfier.
  if (reference.length < 3) {
    return { message: "Indiquez la référence de la transaction Mobile Money ou du virement." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_refund_sent", {
    cible: refundId,
    ref: reference,
    commentaire: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) return { message: translate(error.message) };

  revalidatePath("/admin/remboursements");
  revalidatePath("/compte/reservations");

  return { ok: true, message: "Remboursement marqué comme envoyé." };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Action impossible.";
}
