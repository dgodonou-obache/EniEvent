"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { slugify } from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";

/**
 * Le référentiel des villes.
 *
 * `cities_manage` (migration 0007) réserve l'écriture à `app.is_admin()`.
 *
 * ⚠️ **Une annonce porte le nom de sa ville en texte, pas une clé étrangère.**
 * Renommer « Abomey-Calavi » en « Calavi » ne renomme donc **rien** dans les
 * annonces : elles resteraient rattachées à un nom qui n'existe plus au
 * référentiel, et disparaîtraient du filtre par ville sans qu'aucune erreur ne
 * le signale. C'est la raison du renommage en deux temps ci-dessous — on
 * déplace les annonces dans la même opération, et on le dit à l'écran.
 *
 * Le pays reste `BJ` : le schéma est multi-pays (`cities.country`), mais
 * ouvrir un pays voisin demande des données, pas un formulaire.
 */

export interface CityState {
  message?: string;
  error?: string;
}

async function requireAdmin(): Promise<string | null> {
  const { decision } = await requireSpace("admin");
  return decision.granted ? null : "Accès réservé à l'équipe ÉniEvent.";
}

export async function createCity(_previous: CityState, formData: FormData): Promise<CityState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();

  if (name.length < 2) return { error: "Le nom doit faire au moins 2 caractères." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("cities")
    .insert({ name, slug: slugify(name), region: region || null, country: "BJ" })
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: `« ${name} » existe déjà.` };
    return { error: `Création impossible : ${error.message}` };
  }

  revalidatePath("/admin/villes");
  revalidatePath("/recherche");

  return { message: `« ${name} » a été ajoutée.` };
}

export async function toggleCity(_previous: CityState, formData: FormData): Promise<CityState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const id = String(formData.get("id") ?? "");
  const actif = String(formData.get("active") ?? "") === "true";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cities")
    .update({ is_active: actif })
    .eq("id", id)
    .select("name");

  if (error) return { error: `Modification impossible : ${error.message}` };
  if (!data || data.length === 0) return { error: "Ville introuvable." };

  revalidatePath("/admin/villes");
  revalidatePath("/recherche");

  return {
    message: actif
      ? `« ${data[0].name} » est de nouveau proposée.`
      : `« ${data[0].name} » n'est plus proposée à la recherche. Ses annonces restent en ligne.`,
  };
}

export async function renameCity(_previous: CityState, formData: FormData): Promise<CityState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 2) return { error: "Le nom doit faire au moins 2 caractères." };

  const supabase = await createClient();

  const { data: avant } = await supabase.from("cities").select("name").eq("id", id).single();

  if (!avant) return { error: "Ville introuvable." };
  if (avant.name === name) return { error: "Ce nom est déjà celui de la ville." };

  const { data, error } = await supabase
    .from("cities")
    .update({ name })
    .eq("id", id)
    .select("name");

  if (error) return { error: `Modification impossible : ${error.message}` };
  if (!data || data.length === 0) return { error: "Ville introuvable." };

  // ⚠️ Le second temps, sans lequel le renommage détacherait les annonces.
  // La RLS de `listings` laisse l'administrateur écrire ; on compte les lignes
  // pour pouvoir l'annoncer, car un compte de zéro est une information et non
  // une erreur — une ville neuve n'a pas encore d'annonce.
  const { data: deplacees, error: erreurAnnonces } = await supabase
    .from("listings")
    .update({ city: name })
    .eq("city", avant.name)
    .select("id");

  if (erreurAnnonces) {
    return {
      error: `Ville renommée, mais ses annonces n'ont pas suivi : ${erreurAnnonces.message}. Elles sont encore rattachées à « ${avant.name} ».`,
    };
  }

  revalidatePath("/admin/villes");
  revalidatePath("/recherche");

  const n = deplacees?.length ?? 0;

  return {
    message:
      n === 0
        ? `Renommée en « ${name} ». Aucune annonce n'y était rattachée.`
        : `Renommée en « ${name} », avec ${n} annonce${n > 1 ? "s" : ""} déplacée${n > 1 ? "s" : ""}.`,
  };
}
