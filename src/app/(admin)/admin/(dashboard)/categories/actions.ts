"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { slugify } from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database";

/**
 * Le référentiel des métiers.
 *
 * `categories_manage` (migration 0003) réserve déjà l'écriture à
 * `app.is_admin()` : ces actions écrivent donc la table directement, sans
 * fonction intermédiaire. C'est la différence avec `account_type` ou `status`,
 * qui sont des **colonnes de privilège** dans une table par ailleurs ouverte.
 *
 * ⚠️ **On ne supprime pas une catégorie, on la désactive.** `categories.id` est
 * référencé par `listings` avec `on delete restrict` : une suppression
 * échouerait dès qu'une annonce l'utilise, et réussirait sinon — en faisant
 * disparaître l'historique de celles qui l'ont quittée. Désactiver la retire
 * des écrans sans rien casser, et se défait.
 */

export interface CategoryState {
  message?: string;
  error?: string;
}

type CategoryKind = Database["public"]["Enums"]["category_kind"];

async function requireAdmin(): Promise<string | null> {
  const { decision } = await requireSpace("admin");
  return decision.granted ? null : "Accès réservé à l'équipe ÉniEvent.";
}

export async function createCategory(
  _previous: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as CategoryKind;

  if (name.length < 3) return { error: "Le nom doit faire au moins 3 caractères." };
  if (kind !== "venue" && kind !== "service") return { error: "Choisissez un type." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("categories")
    .insert({ name, kind, slug: slugify(name) })
    .select("id");

  if (error) {
    // `slug` est unique : le doublon est le cas courant, et « duplicate key »
    // ne dit rien à qui remplit un formulaire.
    if (error.code === "23505") return { error: `« ${name} » existe déjà.` };
    return { error: `Création impossible : ${error.message}` };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/categories");

  return { message: `« ${name} » a été créée. Elle est active dès maintenant.` };
}

export async function toggleCategory(
  _previous: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const id = String(formData.get("id") ?? "");
  const actif = String(formData.get("active") ?? "") === "true";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .update({ is_active: actif })
    .eq("id", id)
    .select("name");

  if (error) return { error: `Modification impossible : ${error.message}` };

  // ⚠️ Une ligne masquée par la RLS ne lève aucune erreur : l'UPDATE réussit
  // en touchant zéro ligne. Sans ce contrôle, l'écran annoncerait un
  // changement qui n'a pas eu lieu.
  if (!data || data.length === 0) return { error: "Catégorie introuvable." };

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/recherche");

  return {
    message: actif
      ? `« ${data[0].name} » est de nouveau proposée.`
      : `« ${data[0].name} » n'est plus proposée. Ses annonces existantes restent en ligne.`,
  };
}

export async function renameCategory(
  _previous: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const refus = await requireAdmin();
  if (refus) return { error: refus };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 3) return { error: "Le nom doit faire au moins 3 caractères." };

  const supabase = await createClient();

  // ⚠️ Le `slug` n'est **pas** recalculé : il est dans l'URL publique de la
  // catégorie. Le changer casserait tous les liens déjà partagés et indexés,
  // pour un simple ajustement de libellé.
  const { data, error } = await supabase
    .from("categories")
    .update({ name })
    .eq("id", id)
    .select("name");

  if (error) return { error: `Modification impossible : ${error.message}` };
  if (!data || data.length === 0) return { error: "Catégorie introuvable." };

  revalidatePath("/admin/categories");
  revalidatePath("/categories");

  return { message: `Renommée en « ${name} ». L'adresse publique n'a pas changé.` };
}
