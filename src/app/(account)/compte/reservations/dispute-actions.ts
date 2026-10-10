"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Ouvrir ou retirer un litige.
 *
 * **Une seule action pour les deux parties.** La base distingue le client du
 * prestataire et range le litige du bon côté (`disputes.side`) : écrire deux
 * actions aurait fait deux endroits où se tromper, comme pour l'annulation.
 *
 * Le camp n'est donc **pas** un paramètre. Si le formulaire le fournissait, un
 * client pourrait ouvrir un litige au nom du prestataire — et la décision
 * serait rendue sur la foi d'un champ caché.
 */

export interface DisputeState {
  message?: string;
  ok?: boolean;
}

export async function openDispute(
  _previous: DisputeState,
  formData: FormData,
): Promise<DisputeState> {
  await requireUser();

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("open_dispute", {
    commande: orderId,
    motif: reason,
  });

  if (error) return { message: translate(error.message) };

  rafraichir();

  return {
    ok: true,
    message: `Litige ${data ?? ""} ouvert. L'autre partie vient d'être prévenue et nous examinons votre demande ; aucune somme ne bouge entre-temps.`.trim(),
  };
}

export async function withdrawDispute(
  _previous: DisputeState,
  formData: FormData,
): Promise<DisputeState> {
  await requireUser();

  const supabase = await createClient();

  const { error } = await supabase.rpc("withdraw_dispute", {
    litige: String(formData.get("disputeId") ?? ""),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) return { message: translate(error.message) };

  rafraichir();

  return { ok: true, message: "Litige retiré. Merci de nous l'avoir dit." };
}

function rafraichir() {
  for (const path of ["/compte/reservations", "/pro/reservations", "/admin/litiges"]) {
    revalidatePath(path);
  }
}

/**
 * Les messages de la base sont écrits pour être lus — « utilisez l'annulation,
 * ou écrivez-nous », pas « check violation ». On retire le préfixe de PostgREST.
 */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Votre litige n'a pas pu être ouvert.";
}
