"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Signaler un contenu — un avis, une annonce.
 *
 * Posé dans le groupe de routes de la place de marché et non sous un segment :
 * ce fichier n'est ni une page ni une route, et le bouton vit sur la fiche
 * publique comme dans `/pro/avis`. Même usage croisé que `CancelBooking`, qui
 * importe l'action du compte client et sert aussi au partenaire.
 *
 * ⚠️ **Le retrait éventuel n'est pas décidé ici.** Un avis signalé par une
 * partie concernée est retiré par un **déclencheur sur la table** (migration
 * 0049) : c'est ce qui garantit que tous les chemins d'écriture l'appliquent, y
 * compris ceux qu'on ajoutera plus tard. Cette action ne fait qu'ouvrir le
 * signalement.
 */

export interface ReportState {
  message?: string;
  ok?: boolean;
}

export async function reportContent(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  await requireUser();

  const genre = String(formData.get("genre") ?? "");
  const cible = String(formData.get("cible") ?? "");
  const motif = String(formData.get("reason") ?? "").trim();

  if (genre !== "review" && genre !== "listing") {
    return { message: "Contenu introuvable." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("open_report", { genre, cible, motif });

  if (error) {
    const cleaned = error.message.replace(/^.*?:\s*/, "").trim();
    return { message: cleaned || "Votre signalement n'a pas pu être enregistré." };
  }

  // Un avis signalé par le prestataire concerné disparaît du public sur-le-champ
  // : la fiche et le catalogue doivent le refléter tout de suite, sinon il
  // resterait affiché en cache alors que la note a déjà changé.
  for (const path of ["/recherche", "/admin/signalements", "/pro/avis", "/admin/avis"]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message:
      "Merci : votre signalement est enregistré et sera examiné par l'équipe ÉniEvent.",
  };
}
