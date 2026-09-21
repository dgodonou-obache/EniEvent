"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Écriture d'un message, et ouverture d'un fil.
 *
 * Une seule paire d'actions pour les trois espaces : la base distingue le
 * client du prestataire et applique la règle qui convient. Écrire trois fois
 * la même chose ferait trois endroits où se tromper.
 *
 * ⚠️ **Le masquage n'est pas fait ici.** Il l'est dans `read_conversation`, en
 * base : un masquage applicatif serait contourné par le premier appel direct à
 * l'API. Ce que fait `containsContact` côté client n'est qu'un avertissement.
 */

export interface MessageState {
  message?: string;
  ok?: boolean;
}

export async function sendMessage(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireUser();

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!conversationId) return { message: "Conversation introuvable." };
  if (body.length === 0) return { message: "Écrivez votre message avant de l'envoyer." };
  if (body.length > 4000) {
    return { message: "Ce message est trop long : 4 000 caractères au maximum." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", {
    conversation: conversationId,
    corps: body,
  });

  if (error) return { message: translate(error.message) };

  // Les trois espaces montrent le même fil : chacun doit se rafraîchir.
  for (const path of [
    `/compte/messages/${conversationId}`,
    `/pro/messages/${conversationId}`,
    `/entreprise/messages/${conversationId}`,
    "/compte/messages",
    "/pro/messages",
    "/entreprise/messages",
  ]) {
    revalidatePath(path);
  }

  return { ok: true };
}

export interface OpenState {
  message?: string;
  ok?: boolean;
  /** Renseigné au succès : l'appelant y redirige. */
  conversationId?: string;
}

/** Ouvre — ou retrouve — le fil avec un prestataire, côté client. */
export async function openConversation(
  _previous: OpenState,
  formData: FormData,
): Promise<OpenState> {
  await requireUser();

  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { message: "Prestataire introuvable." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_conversation", {
    org: orgId,
    annonce: String(formData.get("listingId") ?? "") || undefined,
    demande: String(formData.get("requestId") ?? "") || undefined,
  });

  if (error) return { message: translate(error.message) };

  const fil = Array.isArray(data) ? data[0] : data;
  if (!fil) return { message: "Conversation impossible à ouvrir." };

  revalidatePath("/compte/messages");
  revalidatePath("/entreprise/messages");

  return { ok: true, conversationId: fil.id };
}

/**
 * Ouvre le fil depuis une demande de devis, côté prestataire.
 *
 * Il ne désigne pas son interlocuteur : il désigne une demande, et la base en
 * déduit le client. C'est ce qui préserve l'anonymat de l'appel d'offres — rien
 * dans cet échange ne lui rend une identité.
 */
export async function openConversationForRequest(
  _previous: OpenState,
  formData: FormData,
): Promise<OpenState> {
  await requireUser("/pro/connexion");

  const requestId = String(formData.get("requestId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");

  if (!requestId || !orgId) return { message: "Demande introuvable." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_conversation_for_request", {
    demande: requestId,
    mon_org: orgId,
  });

  if (error) return { message: translate(error.message) };

  const fil = Array.isArray(data) ? data[0] : data;
  if (!fil) return { message: "Conversation impossible à ouvrir." };

  revalidatePath("/pro/messages");

  return { ok: true, conversationId: fil.id };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Envoi impossible.";
}
