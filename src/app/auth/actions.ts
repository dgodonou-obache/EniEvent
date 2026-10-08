"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/validation/redirect";
import { createClient } from "@/utils/supabase/server";

/**
 * Déconnexion. La destination dépend de l'espace quitté : un partenaire revient
 * sur `/pro/connexion`, jamais sur la connexion grand public (règle d'isolation).
 *
 * `redirectTo` vient du client : on n'accepte qu'un chemin interne, sinon
 * n'importe quelle page pourrait transformer la déconnexion en redirection
 * ouverte vers un site tiers.
 */
export async function signOut(redirectTo: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Ce contrôle était le seul des quatre à refuser l'anti-slash ; il passe
  // désormais par le filtre commun, pour que la règle ne puisse plus diverger
  // d'un appelant à l'autre.
  redirect(safeInternalPath(redirectTo, "/connexion"));
}
