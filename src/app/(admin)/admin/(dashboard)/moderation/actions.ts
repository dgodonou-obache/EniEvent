"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Décisions de modération.
 *
 * La base refuse déjà qu'un partenaire s'auto-valide : le déclencheur
 * `app.guard_listing_moderation` n'autorise le passage en `approved` ou
 * `rejected` qu'à un administrateur. Ces actions sont la porte d'entrée
 * prévue, pas le rempart.
 */

export interface ModerationState {
  message?: string;
  error?: string;
}

async function requireAdminUser() {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) throw new Error("Accès réservé à l'équipe ÉniEvent.");
}

export async function approveListing(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdminUser();

  const listingId = String(formData.get("listingId") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .update({ status: "approved", moderation_notes: null })
    .eq("id", listingId)
    .select("id, title");

  if (error) return { error: `Validation impossible : ${error.message}` };

  // Une ligne masquée par la RLS ne lève pas d'erreur : l'UPDATE réussit en
  // touchant zéro ligne. Sans ce contrôle, on annoncerait une validation qui
  // n'a pas eu lieu.
  if (!data || data.length === 0) return { error: "Annonce introuvable." };

  revalidatePath("/admin/moderation");
  revalidatePath("/recherche");

  return { message: `« ${data[0].title} » est en ligne.` };
}

export async function rejectListing(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAdminUser();

  const listingId = String(formData.get("listingId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // Un refus sans motif est inexploitable : le partenaire ne saurait pas quoi
  // corriger et resoumettrait à l'identique.
  if (reason.length < 15) {
    return { error: "Indiquez un motif d'au moins 15 caractères, utile au partenaire." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .update({ status: "rejected", moderation_notes: reason })
    .eq("id", listingId)
    .select("id, title");

  if (error) return { error: `Refus impossible : ${error.message}` };
  if (!data || data.length === 0) return { error: "Annonce introuvable." };

  revalidatePath("/admin/moderation");

  return { message: `« ${data[0].title} » a été renvoyée au partenaire.` };
}
