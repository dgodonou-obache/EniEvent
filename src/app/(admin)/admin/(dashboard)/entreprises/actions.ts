"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import type { OrgStatus } from "@/lib/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * Suspendre ou réactiver une organisation.
 *
 * Même piège que le type de compte : `organizations_update_by_admins` autorise
 * bien la **ligne**, mais 0021 a retiré `status` du `grant update`. Sans
 * `set_org_status` (migration 0040), l'écriture échouerait en silence.
 *
 * ⚠️ **Suspendre un partenaire le retire du catalogue public dans la seconde**
 * — `organizations_select` ne rend un partenaire qu'à l'état `active`. C'est
 * l'outil de réponse à un signalement, et il agit tout de suite : on le dit à
 * l'écran plutôt que de le laisser découvrir.
 */

export interface OrgStatusState {
  message?: string;
  error?: string;
}

const STATUTS: readonly OrgStatus[] = ["pending", "active", "suspended"];

export async function setOrgStatus(
  _previous: OrgStatusState,
  formData: FormData,
): Promise<OrgStatusState> {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) return { error: "Accès réservé à l'équipe ÉniEvent." };

  const orgId = String(formData.get("orgId") ?? "");
  const statut = String(formData.get("status") ?? "");

  if (!STATUTS.includes(statut as OrgStatus)) return { error: "Statut inconnu." };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_org_status", {
    org: orgId,
    nouveau: statut as OrgStatus,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/entreprises");
  revalidatePath("/admin/partenaires");
  // Le catalogue public change avec le statut : sans cela, un partenaire
  // suspendu resterait visible jusqu'à la prochaine revalidation.
  revalidatePath("/recherche");

  const nom = data?.brand_name ?? data?.legal_name ?? "Cette organisation";
  return { message: `${nom} est désormais « ${statut} ».` };
}
