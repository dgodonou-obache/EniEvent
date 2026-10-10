"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { fieldErrors } from "@/lib/validation/listing";
import { reviewReplySchema } from "@/lib/validation/review";
import { createClient } from "@/utils/supabase/server";

/**
 * Le droit de réponse du prestataire.
 *
 * **Par fonction, jamais par `update` direct.** Une politique d'écriture sur
 * `reviews` ouvrirait la ligne entière au prestataire — donc la note elle-même,
 * exactement la faille que la migration 0047 vient de refermer sur `listings`.
 * `reply_to_review` vérifie le rôle, l'unicité de la réponse, et journalise.
 *
 * L'appartenance n'est pas revérifiée ici : la fonction la contrôle, et la
 * doubler ferait deux règles à maintenir. `requireSpace` est là pour renvoyer
 * un partenaire déconnecté vers **son** écran de connexion (§4 du guide), pas
 * pour autoriser l'écriture.
 */

export interface ReplyState {
  message?: string;
  ok?: boolean;
  errors?: Record<string, string>;
}

export async function replyToReview(
  _previous: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted) return { message: "Accès réservé aux partenaires." };

  const parsed = reviewReplySchema.safeParse({
    reviewId: formData.get("reviewId"),
    reply: formData.get("reply"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { error } = await supabase.rpc("reply_to_review", {
    avis: parsed.data.reviewId,
    texte: parsed.data.reply,
  });

  if (error) return { message: translate(error.message) };

  revalidatePath("/pro/avis");
  revalidatePath("/admin/avis");
  // La réponse s'affiche sous l'avis, sur la fiche publique.
  revalidatePath("/recherche");

  return { ok: true, message: "Votre réponse est publiée sous l'avis." };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Votre réponse n'a pas pu être publiée.";
}
