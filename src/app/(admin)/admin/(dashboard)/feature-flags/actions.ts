"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Les interrupteurs d'exploitation.
 *
 * ⚠️ **Chaque clé est obéie par du code réel**, et c'est la seule chose qui
 * distingue un réglage d'un décor : `inscriptions_partenaires` est vérifié par
 * un déclencheur sur `organizations`, `messagerie` par des déclencheurs sur
 * `conversations` et `messages` (migration 0040). Le contrôle est en base,
 * pas ici — un interrupteur appliqué dans une Server Action laisserait passer
 * tout appel qui ne la traverse pas.
 *
 * En ajouter un demande donc d'écrire d'abord l'endroit qui lui obéit.
 */

export interface FlagState {
  message?: string;
  error?: string;
}

export async function setFeatureFlag(
  _previous: FlagState,
  formData: FormData,
): Promise<FlagState> {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) return { error: "Accès réservé à l'équipe ÉniEvent." };

  const key = String(formData.get("key") ?? "");
  const actif = String(formData.get("enabled") ?? "") === "true";

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_feature_flag", { cle: key, actif });

  if (error) return { error: error.message };

  revalidatePath("/admin/feature-flags");
  // Ces interrupteurs changent ce que voient les visiteurs : une inscription
  // fermée doit l'être sur-le-champ, pas à la prochaine revalidation.
  revalidatePath("/pro/inscription");

  const nom = data?.label ?? key;
  return { message: actif ? `${nom} : activé.` : `${nom} : coupé.` };
}
