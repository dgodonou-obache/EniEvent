"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { isValidBeninPhone, normaliseBeninPhone } from "@/lib/validation/phone";
import { createClient } from "@/utils/supabase/server";

/**
 * Coordonnées de versement d'un partenaire.
 *
 * **Le nom du titulaire n'est pas une formalité.** Un numéro Mobile Money mal
 * recopié envoie l'argent chez un inconnu, sans retour possible : le nom est
 * ce qui permet de s'en apercevoir avant d'envoyer, pas après.
 *
 * L'appartenance à l'organisation est revérifiée dans la fonction Postgres,
 * qui est `SECURITY DEFINER` et contourne donc la RLS.
 */

export interface PayoutAccountState {
  message?: string;
  ok?: boolean;
}

const MOYENS = ["mtn", "moov", "celtiis", "virement"] as const;

export async function savePayoutAccount(
  _previous: PayoutAccountState,
  formData: FormData,
): Promise<PayoutAccountState> {
  await requireUser();

  const orgId = String(formData.get("orgId") ?? "");
  const moyen = String(formData.get("method") ?? "");
  const numero = String(formData.get("phone") ?? "").trim();
  const titulaire = String(formData.get("holderName") ?? "").trim();
  const banque = String(formData.get("bankDetails") ?? "").trim();

  if (!orgId) return { message: "Organisation introuvable." };
  if (!MOYENS.includes(moyen as (typeof MOYENS)[number])) {
    return { message: "Choisissez un moyen de versement." };
  }

  if (titulaire.length < 2) {
    return { message: "Indiquez le nom du titulaire du compte." };
  }

  if (moyen === "virement") {
    if (banque.length < 10) {
      return { message: "Indiquez les coordonnées bancaires complètes." };
    }
  } else if (!isValidBeninPhone(normaliseBeninPhone(numero))) {
    return {
      message: "Numéro béninois invalide. Exemple : +229 01 97 00 00 01.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_payout_account", {
    org: orgId,
    moyen: moyen as (typeof MOYENS)[number],
    numero: moyen === "virement" ? "" : normaliseBeninPhone(numero),
    titulaire,
    // La signature générée attend `string | undefined` : `undefined` laisse
    // jouer la valeur par défaut côté SQL, là où `null` serait refusé.
    banque: moyen === "virement" ? banque : undefined,
  });

  if (error) return { message: translate(error.message) };

  revalidatePath("/pro/parametres");
  revalidatePath("/pro/finances/versements");

  return {
    ok: true,
    message: "Vos coordonnées de versement sont enregistrées.",
  };
}

function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Enregistrement impossible.";
}
