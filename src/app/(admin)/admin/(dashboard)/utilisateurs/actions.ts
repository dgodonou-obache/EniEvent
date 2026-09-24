"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import type { AccountType } from "@/lib/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * Changer le type d'un compte.
 *
 * ⚠️ **Un `update` direct ne marcherait pas, et ne dirait rien.** La migration
 * 0021 a retiré `account_type` du `grant update` de `authenticated` après
 * qu'un simple utilisateur s'y soit promu `admin`. Un administrateur étant lui
 * aussi `authenticated`, le droit de colonne ne sait pas l'en distinguer :
 * l'écriture échouerait en touchant zéro ligne, sans erreur. Tout passe donc
 * par `set_account_type` (migration 0040), qui interroge `app.is_admin()`.
 *
 * Les deux refus que la base oppose — se retirer soi-même l'administration,
 * retirer le dernier administrateur — remontent tels quels : ils sont écrits
 * pour être lus par un humain.
 */

export interface AccountTypeState {
  message?: string;
  error?: string;
}

const TYPES: readonly AccountType[] = ["particulier", "entreprise", "partenaire", "admin"];

export async function setAccountType(
  _previous: AccountTypeState,
  formData: FormData,
): Promise<AccountTypeState> {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) return { error: "Accès réservé à l'équipe ÉniEvent." };

  const userId = String(formData.get("userId") ?? "");
  const type = String(formData.get("accountType") ?? "");

  if (!TYPES.includes(type as AccountType)) {
    return { error: "Type de compte inconnu." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_account_type", {
    cible: userId,
    nouveau: type as AccountType,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/utilisateurs");

  const nom = data?.full_name ?? "Ce compte";
  return { message: `${nom} est désormais « ${type} ».` };
}
