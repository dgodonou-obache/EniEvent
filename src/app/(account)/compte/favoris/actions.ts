"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

/**
 * Basculer une annonce dans les favoris, ou l'en retirer.
 *
 * ⚠️ **Le formulaire ne porte que l'identifiant de l'annonce, jamais l'état
 * voulu.** La première version envoyait un champ caché `active` calculé au
 * rendu — et c'était un défaut de conception, pas un détail :
 *
 *   1. le clic met à jour l'état d'affichage ;
 *   2. React refait le rendu **avant** que le navigateur ne sérialise le
 *      formulaire ;
 *   3. le champ caché vaut alors l'inverse, et le serveur reçoit le contraire
 *      de ce que la personne a demandé.
 *
 * En production, cela donnait : premier clic sans effet, second clic qui
 * allumait le cœur sans rien écrire — la réponse du serveur étant identique à
 * la précédente, la correction d'état ne se déclenchait même pas. Le cœur
 * mentait, et la page Favoris restait vide.
 *
 * Une bascule décidée **en base** rend cette classe de défaut impossible : il
 * n'y a plus d'intention à transmettre, donc plus rien à désynchroniser. La
 * valeur rendue est la vérité, et l'écran s'y aligne.
 *
 * ⚠️ **Pas de `requireSpace` ici.** Le cœur s'affiche sur la vitrine, qui
 * n'appartient à aucun espace : passer par la garde d'un espace renverrait un
 * visiteur du catalogue vers `/compte` alors qu'il compare des salles. On
 * vérifie qu'il y a une session, et la RLS `favorites_own` fait le reste.
 */

export interface FavoriteState {
  /** L'état **réel** après le geste, tel que la base le connaît. */
  active?: boolean;
  error?: string;
}

export async function toggleFavorite(
  _previous: FavoriteState,
  formData: FormData,
): Promise<FavoriteState> {
  const listingId = String(formData.get("listingId") ?? "");

  if (!listingId) return { error: "Annonce inconnue." };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { active: false, error: "Connectez-vous pour garder cette annonce de côté." };
  }

  const { data: existant } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existant) {
    const { data, error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .select("listing_id");

    // ⚠️ Un DELETE bloqué par la RLS ne lève rien : il touche zéro ligne. Sans
    // ce contrôle, on annoncerait un retrait qui n'a pas eu lieu.
    if (error || !data || data.length === 0) {
      return { active: true, error: "Impossible de retirer ce favori." };
    }

    revalidatePath("/compte/favoris");
    return { active: false };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, listing_id: listingId });

  if (error) {
    // Deux onglets ouverts sur la même annonce, ou un double clic : la ligne
    // existe déjà. Ce n'est pas une erreur, c'est le résultat voulu.
    if (error.code === "23505") {
      revalidatePath("/compte/favoris");
      return { active: true };
    }

    return { active: false, error: "Impossible d'enregistrer ce favori." };
  }

  revalidatePath("/compte/favoris");
  return { active: true };
}
