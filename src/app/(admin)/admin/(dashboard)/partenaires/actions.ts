"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Réglage des commissions.
 *
 * ⚠️ **Ces écritures passent obligatoirement par une fonction Postgres.** La
 * migration 0021 a retiré `commission_rate_override` des colonnes écrivables
 * par `authenticated` — et un administrateur est lui aussi `authenticated`. Un
 * `update` direct depuis ici ne lèverait aucune erreur : il toucherait zéro
 * ligne, et l'écran annoncerait un taux enregistré qui ne l'est pas.
 *
 * `set_commission_rate` et `set_default_commission_rate` revérifient
 * `app.is_admin()` : elles sont `SECURITY DEFINER`, donc le refus du proxy ne
 * suffirait pas à les protéger d'un appel direct.
 */

export interface CommissionState {
  message?: string;
  ok?: boolean;
  /** Identifie la ligne concernée, pour n'afficher le retour qu'à cet endroit. */
  orgId?: string;
}

/** Accepte « 12 », « 12,5 » et « 12.5 » : une virgue décimale est la norme ici. */
function parseRate(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (cleaned === "") return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

export async function setCommissionRate(
  _previous: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  await requireUser("/admin/connexion");

  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { message: "Partenaire introuvable." };

  // Un champ vide n'est pas un taux de zéro : il remet le partenaire au barème
  // général. Les confondre ferait travailler un prestataire gratuitement sur
  // une simple hésitation de saisie.
  const auBareme = formData.get("useDefault") === "on";
  const taux = auBareme ? null : parseRate(String(formData.get("rate") ?? ""));

  if (taux !== null && Number.isNaN(taux)) {
    return { orgId, message: "Indiquez un nombre, par exemple 12 ou 12,5." };
  }

  if (taux !== null && (taux < 0 || taux > 100)) {
    return { orgId, message: "Un taux de commission se situe entre 0 et 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_commission_rate", {
    org: orgId,
    taux: taux ?? undefined,
  });

  if (error) return { orgId, message: translate(error.message) };

  revalidatePath("/admin/partenaires");

  return {
    orgId,
    ok: true,
    message: taux === null ? "Ce partenaire suit désormais le barème général." : `Commission fixée à ${taux} %.`,
  };
}

export async function setDefaultCommissionRate(
  _previous: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  await requireUser("/admin/connexion");

  const taux = parseRate(String(formData.get("rate") ?? ""));

  if (taux === null || Number.isNaN(taux)) {
    return { message: "Indiquez un nombre, par exemple 10 ou 12,5." };
  }

  if (taux < 0 || taux > 100) {
    return { message: "Un taux de commission se situe entre 0 et 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_default_commission_rate", { taux });

  if (error) return { message: translate(error.message) };

  revalidatePath("/admin/partenaires");
  return { ok: true, message: `Barème général fixé à ${taux} %.` };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Enregistrement impossible.";
}
