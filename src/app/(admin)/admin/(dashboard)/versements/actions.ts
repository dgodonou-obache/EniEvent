"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Préparation et envoi des versements.
 *
 * **Préparer et envoyer sont deux gestes distincts**, et c'est volontaire.
 * Préparer fige le montant et rattache les encaissements ; envoyer consigne
 * que l'argent est parti. Les confondre rendrait impossible de vérifier un
 * montant avant de virer — or un virement Mobile Money ne se rattrape pas.
 *
 * Le statut d'administrateur est revérifié dans chaque fonction Postgres :
 * elles sont `SECURITY DEFINER` et contournent la RLS, donc le refus du proxy
 * ne suffirait pas à les protéger d'un appel direct.
 */

export interface PayoutState {
  message?: string;
  ok?: boolean;
}

export async function preparePayout(
  _previous: PayoutState,
  formData: FormData,
): Promise<PayoutState> {
  await requireUser("/admin/connexion");

  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { message: "Partenaire introuvable." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payout", { org: orgId });

  if (error) return { message: translate(error.message) };

  const ligne = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/versements");

  return { ok: true, message: `Versement ${ligne?.reference ?? ""} préparé.` };
}

export async function sendPayout(
  _previous: PayoutState,
  formData: FormData,
): Promise<PayoutState> {
  await requireUser("/admin/connexion");

  const payoutId = String(formData.get("payoutId") ?? "");
  const reference = String(formData.get("providerRef") ?? "").trim();

  if (!payoutId) return { message: "Versement introuvable." };

  // Une référence de transaction est exigée : sans elle, « envoyé » n'est
  // qu'une affirmation, et rien ne permet de retrouver le virement en cas de
  // contestation.
  if (reference.length < 3) {
    return { message: "Indiquez la référence de la transaction Mobile Money ou du virement." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payout_sent", {
    cible: payoutId,
    ref: reference,
    commentaire: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) return { message: translate(error.message) };

  revalidatePath("/admin/versements");
  return { ok: true, message: "Versement marqué comme envoyé." };
}

export async function cancelPayout(
  _previous: PayoutState,
  formData: FormData,
): Promise<PayoutState> {
  await requireUser("/admin/connexion");

  const payoutId = String(formData.get("payoutId") ?? "");
  if (!payoutId) return { message: "Versement introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_payout", {
    cible: payoutId,
    motif: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) return { message: translate(error.message) };

  revalidatePath("/admin/versements");
  return { ok: true, message: "Versement annulé. Les encaissements redeviennent à verser." };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Action impossible.";
}
