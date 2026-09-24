import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Invitations en attente d'une organisation.
 *
 * ⚠️ **Le jeton n'est pas sélectionné, et ne peut pas l'être** : la migration
 * 0042 le retire du droit de lecture de `authenticated` (`revoke select
 * (token)`). Ce n'est pas une précaution d'écran mais un droit de colonne —
 * l'ajouter au `select` ferait échouer la requête, ce qui est exactement le
 * comportement voulu.
 */

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  /**
   * Calculé ici, et non à l'affichage.
   *
   * ⚠️ Appeler `Date.now()` pendant le rendu d'un composant est impur — la
   * règle `react-hooks/purity` le refuse, et elle a raison : la valeur
   * changerait à chaque rendu accidentel. C'est de toute façon le serveur qui
   * fait foi sur l'heure, puisque c'est lui qui a écrit l'échéance.
   */
  expired: boolean;
}

export async function getPendingInvitations(orgId: string): Promise<PendingInvitation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, expires_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  // Une invitation illisible ne doit pas emporter l'écran d'équipe, qui reste
  // utile sans elle : on rend une liste vide plutôt que de lever.
  if (error) return [];

  const maintenant = Date.now();

  return (data ?? []).map((i) => ({
    id: i.id,
    email: String(i.email),
    role: i.role,
    expiresAt: i.expires_at,
    expired: new Date(i.expires_at).getTime() < maintenant,
  }));
}
