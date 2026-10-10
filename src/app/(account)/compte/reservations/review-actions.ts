"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import type { Database } from "@/types/database";
import { fieldErrors } from "@/lib/validation/listing";
import { reviewSchema } from "@/lib/validation/review";
import { createClient } from "@/utils/supabase/server";

/**
 * Dépôt d'un avis par le client.
 *
 * Dans un fichier à part de `actions.ts` : un fichier `"use server"` n'exporte
 * que des fonctions asynchrones, et mêler annulation et avis dans le même
 * module rendrait les deux imports clients plus lourds sans rien simplifier.
 *
 * **Trois champs partent, et c'est tout.** L'auteur, l'organisation notée,
 * l'annonce et la signature publique sont **dérivés en base** par
 * `app.guard_review_eligibility` : rien de ce qui compte ne traverse le réseau.
 * C'est la même règle que `start_payment`, qui ne reçoit jamais un montant.
 *
 * L'éligibilité n'est pas revérifiée ici. Elle vit dans le déclencheur, qui
 * couvre tous les chemins d'écriture (§2 du guide) ; la doubler à cet endroit
 * ferait deux règles à maintenir, et c'est celle de l'écran qui finirait par
 * divorcer de la vraie.
 */

export interface ReviewState {
  message?: string;
  ok?: boolean;
  errors?: Record<string, string>;
}

export async function submitReview(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  await requireUser();

  const parsed = reviewSchema.safeParse({
    orderId: formData.get("orderId"),
    rating: formData.get("rating"),
    body: formData.get("body"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // ⚠️ Le typage généré exige `author_id`, `author_label` et `org_id` : il les
  // voit `not null` et sans valeur par défaut, et il ne peut pas savoir qu'un
  // déclencheur `before insert` les pose. Les envoyer serait **pire que
  // superflu** — ce sont précisément les colonnes qu'un client pourrait
  // vouloir mentir, et le `grant insert` de la migration 0048 ne couvre que
  // les trois ci-dessous : les nommer ferait échouer la requête en
  // « permission denied ». D'où cette coupure de typage, qui dit la vérité du
  // schéma plutôt que celle du générateur.
  const ligne = {
    order_id: parsed.data.orderId,
    rating: parsed.data.rating,
    // Chaîne vide = pas de commentaire. La contrainte de la base refuserait
    // un texte de zéro caractère, qui n'est pas la même chose qu'aucun texte.
    body: parsed.data.body && parsed.data.body.length > 0 ? parsed.data.body : null,
  };

  const { error } = await supabase
    .from("reviews")
    .insert(ligne as unknown as Database["public"]["Tables"]["reviews"]["Insert"]);

  if (error) return { message: translate(error.message) };

  // Un avis change la note de l'annonce, donc le catalogue et l'accueil.
  for (const path of [
    "/compte/reservations",
    "/pro/avis",
    "/admin/avis",
    "/recherche",
    "/",
  ]) {
    revalidatePath(path);
  }

  return { ok: true, message: "Merci : votre avis est publié." };
}

/**
 * Les messages de la base sont déjà écrits pour être lus par un client — le
 * déclencheur dit « dès le lendemain de la prestation », pas « check violation ».
 * On retire seulement le préfixe que PostgREST ajoute devant.
 */
function translate(message: string): string {
  if (/duplicate key|reviews_order_id_key/i.test(message)) {
    return "Vous avez déjà donné votre avis sur cette réservation.";
  }

  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Votre avis n'a pas pu être enregistré.";
}
