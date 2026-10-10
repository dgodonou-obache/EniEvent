"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Arbitrage d'un litige.
 *
 * ⚠️ **Rien ici ne déplace un franc, et c'est délibéré.** Il existe une façon
 * de rembourser — `cancel_order` — qui applique le barème figé sur la commande
 * et borne le rendu à l'encaissé (§1 du guide). En ouvrir une seconde dans un
 * lot sur la confiance serait exactement le mauvais endroit : deux chemins vers
 * l'argent, c'est deux endroits où se tromper, et le second n'aurait ni barème
 * ni plafond.
 *
 * Trancher en faveur du client veut donc dire : annuler la réservation depuis
 * `/admin/reservations`, puis **rattacher ici** le remboursement produit. On
 * consigne une décision, on n'invente pas un virement — et `resolve_dispute`
 * vérifie que le remboursement rattaché porte bien sur cette commande.
 */

export interface DisputeState {
  message?: string;
  error?: string;
}

const ISSUES = ["under_review", "resolved_refund", "resolved_partner"] as const;
type Issue = (typeof ISSUES)[number];

function isIssue(value: string): value is Issue {
  return (ISSUES as readonly string[]).includes(value);
}

export async function resolveDispute(
  _previous: DisputeState,
  formData: FormData,
): Promise<DisputeState> {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) return { error: "Accès réservé à l'équipe ÉniEvent." };

  const issue = String(formData.get("issue") ?? "");
  if (!isIssue(issue)) return { error: "Issue inattendue." };

  const note = String(formData.get("note") ?? "").trim();
  const refund = String(formData.get("refundId") ?? "").trim();

  const supabase = await createClient();

  const { error } = await supabase.rpc("resolve_dispute", {
    litige: String(formData.get("disputeId") ?? ""),
    issue,
    note: note || "",
    remboursement: refund || undefined,
  });

  if (error) {
    const cleaned = error.message.replace(/^.*?:\s*/, "").trim();
    return { error: cleaned || "Arbitrage impossible." };
  }

  for (const path of ["/admin/litiges", "/compte/reservations", "/pro/reservations"]) {
    revalidatePath(path);
  }

  return {
    message:
      issue === "under_review"
        ? "Litige passé en examen. Les deux parties savent qu'il est pris en charge."
        : "Décision enregistrée. Elle est consignée au journal et lisible par les deux parties.",
  };
}
