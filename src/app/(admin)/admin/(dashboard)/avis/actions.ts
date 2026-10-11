"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { REASON_MIN } from "@/lib/validation/review";
import { createClient } from "@/utils/supabase/server";

/**
 * Modération des avis — et elle ne porte que sur le **texte**.
 *
 * ⚠️ **Un avis ne se retire pas, décision d'exploitation du 11 octobre 2026.**
 * Retirer un mauvais avis est un signe de méfiance envers la plateforme : un
 * visiteur qui ne voit que des éloges n'en conclut pas que les prestataires
 * sont bons, il en conclut que le reste a été effacé. Le recours d'un
 * partenaire est la **réponse publique**, et elle seule.
 *
 * Ce qui subsiste, et à cette condition seulement : un avis peut contenir
 * autre chose qu'un reproche — une insulte nommant un salarié, un numéro de
 * téléphone qui contournerait tout le masquage des coordonnées, l'adresse de
 * quelqu'un. `redact_review_body` retire ce texte-là, pour un motif **publié
 * sous l'avis**, et :
 *
 * - **la note reste comptée**, ce qui est le point entier. Sans cela,
 *   « contenu illicite » redeviendrait le moyen de faire disparaître un 1/5, et
 *   on serait revenu au point de départ par la porte de service ;
 * - **l'avis reste affiché**, avec ses étoiles et le motif à la place du texte.
 *   La plateforme ne cache pas qu'il s'est passé quelque chose, elle dit quoi.
 *
 * Le geste est journalisé dans `audit_logs` — contrairement à la modération des
 * annonces, qui ne laisse aucune trace et n'est pas un modèle à reprendre.
 */

export interface ModerationState {
  message?: string;
  error?: string;
}

async function requireAdmin() {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) throw new Error("Accès réservé à l'équipe ÉniEvent.");
}

function rafraichir() {
  for (const path of ["/admin/avis", "/admin/signalements", "/pro/avis", "/recherche", "/"]) {
    revalidatePath(path);
  }
}

export async function redactReviewBody(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdmin();

  const reviewId = String(formData.get("reviewId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // Ce motif est **lu par le public**, à la place du commentaire. D'où le
  // minimum : il doit se lire comme une phrase, pas comme un code interne.
  if (reason.length < REASON_MIN) {
    return { error: `Indiquez un motif d'au moins ${REASON_MIN} caractères : il sera publié.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("redact_review_body", {
    avis: reviewId,
    motif: reason,
  });

  if (error) return { error: translate(error.message) };

  rafraichir();

  return {
    message:
      "Commentaire retiré. Le motif s'affiche à sa place, et la note du client continue de compter.",
  };
}

export async function restoreReviewBody(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_review_body", {
    avis: String(formData.get("reviewId") ?? ""),
  });

  if (error) return { error: translate(error.message) };

  rafraichir();

  return { message: "Commentaire rétabli : le texte du client est de nouveau affiché." };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Opération impossible.";
}
