"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/**
 * Mettre une annonce de côté, ou l'en retirer.
 *
 * ⚠️ **Pas de `requireSpace` ici, et c'est délibéré.** Le cœur s'affiche sur
 * la vitrine, qui n'appartient à aucun espace : passer par la garde d'un
 * espace renverrait un visiteur du catalogue vers `/compte` alors qu'il est en
 * train de comparer des salles. On vérifie donc simplement qu'il y a une
 * session, et on le dit poliment sinon — la RLS `favorites_own` fait le reste.
 */

export interface FavoriteState {
  /** L'état après le geste, pour que le bouton n'attende pas un rechargement. */
  active?: boolean;
  error?: string;
}

export async function toggleFavorite(
  _previous: FavoriteState,
  formData: FormData,
): Promise<FavoriteState> {
  const listingId = String(formData.get("listingId") ?? "");
  const actif = String(formData.get("active") ?? "") === "true";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { active: false, error: "Connectez-vous pour garder cette annonce de côté." };
  }

  if (actif) {
    // `upsert` plutôt qu'`insert` : deux onglets ouverts sur la même annonce
    // produiraient sinon une violation de clé primaire, pour un geste qui n'a
    // rien d'une erreur.
    const { error } = await supabase
      .from("favorites")
      .upsert({ user_id: user.id, listing_id: listingId }, { onConflict: "user_id,listing_id" });

    if (error) return { active: false, error: "Impossible d'enregistrer ce favori." };
  } else {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId);

    if (error) return { active: true, error: "Impossible de retirer ce favori." };
  }

  revalidatePath("/compte/favoris");

  return { active: actif };
}
