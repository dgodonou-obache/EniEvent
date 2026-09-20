"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

/**
 * Annulation d'une réservation.
 *
 * **Le montant du remboursement n'est pas un paramètre.** `cancel_order` le
 * déduit du barème figé sur la commande, de la date et de ce qui a réellement
 * été encaissé — exactement comme `start_payment` déduit le sien. Laisser
 * l'appelant proposer une somme rendrait inutile tout contrôle en aval.
 *
 * Une seule action pour le client et pour le partenaire : la base distingue
 * les deux et applique la règle qui convient — un partenaire qui se désiste
 * rembourse intégralement, le barème ne le protégeant que du changement d'avis
 * du client. Écrire deux actions aurait fait deux endroits où se tromper.
 */

export interface CancelState {
  message?: string;
  ok?: boolean;
}

export async function cancelOrder(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  await requireUser();

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { message: "Réservation introuvable." };

  const supabase = await createClient();

  // Lu **avant** l'annulation : la devise pour dire la somme juste, et le
  // client pour savoir à qui l'on s'adresse. Le formulaire ne les fournit pas
  // — il ne fournit jamais rien qui décide de quoi que ce soit.
  const [{ data: commande }, { data: session }] = await Promise.all([
    supabase.from("orders").select("currency, client_id").eq("id", orderId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const devise = (commande?.currency as CurrencyCode) ?? "XOF";
  const parLeClient = commande?.client_id === session.user?.id;

  const { data, error } = await supabase.rpc("cancel_order", {
    cible: orderId,
    motif: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) return { message: translate(error.message) };

  // Une annulation change ce que voient les trois espaces : le client y perd
  // une réservation, le partenaire une date, l'administration y gagne un
  // remboursement à envoyer.
  for (const path of [
    "/compte/reservations",
    "/compte/paiements",
    "/projets",
    "/pro/reservations",
    "/pro/finances/versements",
    "/admin/reservations",
    "/admin/remboursements",
    "/admin/versements",
  ]) {
    revalidatePath(path);
  }

  const issue = Array.isArray(data) ? data[0] : data;
  const rendu = typeof issue?.refunded === "number" ? issue.refunded : 0;

  if (rendu <= 0) {
    return {
      ok: true,
      message:
        "Réservation annulée. D'après les conditions, aucune somme n'est remboursable.",
    };
  }

  const somme = format(money(rendu, devise));

  return {
    ok: true,
    message: parLeClient
      ? `Réservation annulée. ${somme} vous seront remboursés ; nous vous contacterons pour le versement.`
      : `Réservation annulée. ${somme} seront remboursés au client — vous vous êtes désisté, le barème ne s'applique pas.`,
  };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Annulation impossible.";
}
