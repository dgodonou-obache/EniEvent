"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { REASON_MIN } from "@/lib/validation/review";
import { createClient } from "@/utils/supabase/server";

/**
 * Modération des avis.
 *
 * ⚠️ **Le circuit de modération des annonces ne journalise rien et ne prévient
 * personne** (`/admin/moderation`). Ce n'est pas un modèle à reprendre : un
 * avis retiré est une parole supprimée, et la trace de qui l'a retirée et
 * pourquoi est ce qui distingue une modération d'un arbitraire.
 * `hide_review` et `reinstate_review` écrivent donc dans `audit_logs`.
 *
 * **Retirer n'est pas effacer.** Un avis masqué sort des moyennes et du public,
 * mais reste lisible par son auteur et par le prestataire concerné : on ne
 * supprime pas la parole de quelqu'un sans qu'il puisse la relire.
 *
 * Le rétablissement pose `reinstated_at`, qui vaut **immunité** : un nouveau
 * signalement ne masquera plus cet avis. Sans cela, un prestataire pourrait
 * faire disparaître indéfiniment un avis sévère en le resignalant après chaque
 * examen.
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

export async function hideReview(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdmin();

  const reviewId = String(formData.get("reviewId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // Même minimum qu'en base. C'est ce motif qu'on relira dans six mois si
  // l'auteur réclame, et « spam » n'expliquera rien.
  if (reason.length < REASON_MIN) {
    return { error: `Indiquez un motif d'au moins ${REASON_MIN} caractères.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_review", { avis: reviewId, motif: reason });

  if (error) return { error: translate(error.message) };

  rafraichir();

  return { message: "Avis retiré. Il ne compte plus dans la note du prestataire." };
}

export async function reinstateReview(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("reinstate_review", {
    avis: String(formData.get("reviewId") ?? ""),
  });

  if (error) return { error: translate(error.message) };

  rafraichir();

  return {
    message:
      "Avis rétabli. Il ne pourra plus être masqué par un nouveau signalement : seule l'équipe pourra le retirer de nouveau.",
  };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Opération impossible.";
}
