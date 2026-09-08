"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { declineSchema } from "@/lib/validation/quote";
import { fieldErrors } from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";

/**
 * Décisions du client sur les devis reçus.
 *
 * L'acceptation n'est pas un UPDATE : elle refuse les offres concurrentes et
 * attribue le besoin dans la même transaction. Elle passe donc par la fonction
 * Postgres `accept_quote`, qui vérifie elle-même que l'appelant est bien le
 * demandeur — indispensable, puisqu'une fonction `SECURITY DEFINER` contourne
 * la RLS.
 */

export interface ProjectState {
  errors?: Record<string, string>;
  message?: string;
  ok?: boolean;
}

export async function acceptQuote(
  _previous: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  await requireUser();

  const quoteId = String(formData.get("quoteId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_quote", { target: quoteId });

  if (error) return { message: translate(error.message) };

  revalidatePath(`/projets/${requestId}`);
  revalidatePath("/projets");

  return { ok: true, message: "Offre retenue. Le prestataire en est informé." };
}

export async function declineQuote(
  _previous: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  await requireUser();

  const quoteId = String(formData.get("quoteId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");

  const parsed = declineSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "declined", decline_reason: parsed.data.reason })
    .eq("id", quoteId)
    .select("id");

  if (error) return { message: translate(error.message) };

  // Une ligne masquée par la RLS ne lève pas d'erreur : l'UPDATE touche
  // simplement 0 ligne.
  if (!data || data.length === 0) return { message: "Devis introuvable." };

  revalidatePath(`/projets/${requestId}`);
  return { ok: true, message: "Offre écartée. Le prestataire reçoit votre motif." };
}

/** Clôt les candidatures sans encore choisir : plus aucune offre n'entrera. */
export async function closeRequest(
  _previous: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  await requireUser();

  const requestId = String(formData.get("requestId") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .update({ status: "closed" })
    .eq("id", requestId)
    .select("id");

  if (error) return { message: translate(error.message) };
  if (!data || data.length === 0) return { message: "Demande introuvable." };

  revalidatePath(`/projets/${requestId}`);
  revalidatePath("/projets");

  return { ok: true, message: "Demande close : vous ne recevrez plus de nouvelles offres." };
}

export async function cancelRequest(
  _previous: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  await requireUser();

  const requestId = String(formData.get("requestId") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .select("id");

  if (error) return { message: translate(error.message) };
  if (!data || data.length === 0) return { message: "Demande introuvable." };

  revalidatePath("/projets");
  return { ok: true, message: "Demande annulée." };
}

/**
 * Les messages des déclencheurs sont déjà en français et destinés à être lus.
 * On ne relaie que le nécessaire, sans le code d'erreur Postgres.
 */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Action impossible.";
}
