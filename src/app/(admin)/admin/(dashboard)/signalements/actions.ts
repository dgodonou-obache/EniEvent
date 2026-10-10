"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { REASON_MIN } from "@/lib/validation/review";
import { createClient } from "@/utils/supabase/server";

/**
 * Trancher un signalement.
 *
 * ⚠️ **« Écarté » est irréversible pour les signalements suivants.** Écarter
 * rétablit l'avis **et l'immunise** : plus aucun signalement ne le masquera.
 * C'est ce qui empêche un prestataire de faire disparaître un avis à
 * perpétuité en le resignalant après chaque examen — et c'est pour ça que
 * l'écran l'annonce avant le clic plutôt qu'après.
 *
 * `resolve_report` fait les deux gestes en une transaction : trancher le
 * signalement et agir sur l'avis. Les séparer laisserait la base dans un état
 * où l'un est fait et l'autre non, sans que rien ne le signale.
 */

export interface ReportState {
  message?: string;
  error?: string;
}

async function requireAdmin() {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) throw new Error("Accès réservé à l'équipe ÉniEvent.");
}

async function trancher(
  formData: FormData,
  issue: "upheld" | "dismissed",
): Promise<ReportState> {
  await requireAdmin();

  const reportId = String(formData.get("reportId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  // La décision est lue par l'auteur de l'avis si elle lui est opposée, et par
  // nous-mêmes dans six mois. « ok » n'expliquera rien.
  if (note.length < REASON_MIN) {
    return { error: `Écrivez la décision en au moins ${REASON_MIN} caractères.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_report", {
    signalement: reportId,
    issue,
    note,
  });

  if (error) {
    const cleaned = error.message.replace(/^.*?:\s*/, "").trim();
    return { error: cleaned || "Décision impossible." };
  }

  for (const path of ["/admin/signalements", "/admin/avis", "/pro/avis", "/recherche", "/"]) {
    revalidatePath(path);
  }

  return {
    message:
      issue === "upheld"
        ? "Signalement retenu. L'avis reste retiré du public et de la note."
        : "Signalement écarté. L'avis est rétabli, et aucun nouveau signalement ne pourra le masquer.",
  };
}

export async function upholdReport(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  return trancher(formData, "upheld");
}

export async function dismissReport(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  return trancher(formData, "dismissed");
}
