"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Conditions de règlement du partenaire.
 *
 * L'échéancier est remplacé en bloc, jamais ligne à ligne : il se lit comme un
 * tout, et une mise à jour partielle pourrait le laisser sans solde — donc
 * incapable de réclamer la totalité. `save_payment_schedule` refuse d'ailleurs
 * un envoi sans exactement une ligne « solde », placée en dernier.
 *
 * L'appartenance à l'organisation est vérifiée **dans la fonction Postgres**,
 * qui est `SECURITY DEFINER` et contourne donc la RLS : la contrôler ici
 * seulement laisserait la porte ouverte à un appel direct.
 */

export interface ScheduleState {
  message?: string;
  ok?: boolean;
}

interface LigneEnvoyee {
  label: string;
  trigger: "booking" | "before_event";
  days_before: string;
  amount_kind: "percent" | "fixed" | "balance";
  percent: string;
  fixed_amount: string;
}

export async function saveSchedule(
  _previous: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  await requireUser();

  const orgId = String(formData.get("orgId") ?? "");
  const brut = String(formData.get("lignes") ?? "");

  if (!orgId) return { message: "Organisation introuvable." };

  let lignes: LigneEnvoyee[];
  try {
    lignes = JSON.parse(brut);
  } catch {
    return { message: "Échéancier illisible." };
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return { message: "Un échéancier comporte au moins une ligne." };
  }

  // Nettoyage avant envoi : la base refuserait de toute façon, mais un message
  // clair vaut mieux qu'une violation de contrainte traduite à la volée.
  const propres = lignes.map((l) => ({
    label: String(l.label ?? "").slice(0, 80),
    trigger: l.trigger === "booking" ? "booking" : "before_event",
    days_before: l.trigger === "booking" ? "" : String(Math.max(0, Number(l.days_before) || 0)),
    amount_kind: l.amount_kind,
    percent: l.amount_kind === "percent" ? String(Number(l.percent) || 0) : "",
    fixed_amount: l.amount_kind === "fixed" ? String(Math.trunc(Number(l.fixed_amount) || 0)) : "",
  }));

  const soldes = propres.filter((l) => l.amount_kind === "balance").length;
  if (soldes !== 1) {
    return { message: "Un échéancier comporte exactement une ligne « solde »." };
  }
  if (propres[propres.length - 1].amount_kind !== "balance") {
    return { message: "La ligne « solde » doit être la dernière." };
  }

  // Un total d'avances dépassant 100 % ne serait pas faux en base — le solde
  // absorberait —, mais il produirait un échéancier dont la dernière ligne vaut
  // zéro, donc un solde que le client ne verra jamais.
  const avances = propres
    .filter((l) => l.amount_kind === "percent")
    .reduce((total, l) => total + Number(l.percent), 0);

  if (avances > 100) {
    return { message: `Les pourcentages totalisent ${avances} % : ils ne peuvent pas dépasser 100 %.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_payment_schedule", { org: orgId, lignes: propres });

  if (error) return { message: translate(error.message) };

  revalidatePath("/pro/parametres");
  return { ok: true, message: "Vos conditions de règlement sont enregistrées." };
}

/** Les messages des fonctions Postgres sont déjà en français et destinés à être lus. */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Enregistrement impossible.";
}
