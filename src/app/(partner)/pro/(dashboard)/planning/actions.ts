"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import {
  PLANNING_SLOT,
  dayLabel,
  isPlanningAction,
  validateBulkEdit,
  type PlanningAction,
} from "@/lib/planning";
import { createClient } from "@/utils/supabase/server";

/**
 * Écriture du planning partenaire.
 *
 * Même règle que pour les annonces : l'organisation vient **de la session**,
 * jamais du formulaire. Le formulaire ne transmet que l'annonce visée, dont
 * l'appartenance est revérifiée avant toute écriture.
 */

export interface PlanningState {
  /** `true` quand l'écriture a eu lieu — sert à colorer le retour. */
  ok?: boolean;
  message?: string;
}

export async function applyPlanning(
  _previous: PlanningState,
  formData: FormData,
): Promise<PlanningState> {
  const { decision } = await requireSpace("partner", "/pro/connexion");

  if (!decision.granted || !decision.org) {
    // Le layout a déjà filtré : filet de sécurité si l'action est appelée
    // directement, une Server Action étant un point d'entrée réseau.
    throw new Error("Aucune organisation partenaire active.");
  }

  const orgId = decision.org.orgId;
  const listingId = String(formData.get("listingId") ?? "");
  const rawAction = String(formData.get("action") ?? "");

  if (!isPlanningAction(rawAction)) return { message: "Action inconnue." };
  const action: PlanningAction = rawAction;

  const dates = String(formData.get("dates") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const rawPrice = String(formData.get("price") ?? "").replace(/\s/g, "").trim();
  const price = rawPrice === "" ? null : Number(rawPrice);

  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("id, min_price")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!listing) return { message: "Annonce introuvable." };

  if (dates.length === 0) return { message: "Sélectionnez au moins une date." };

  // Lecture par plage plutôt que par liste : une liste de 366 dates ferait une
  // URL de plusieurs kilo-octets, que certains intermédiaires tronquent.
  const from = dates.reduce((a, b) => (a < b ? a : b));
  const to = dates.reduce((a, b) => (a > b ? a : b));

  const { data: window, error: readError } = await supabase
    .from("availabilities")
    .select("date, status, price, inventory")
    .eq("listing_id", listingId)
    .eq("slot", PLANNING_SLOT)
    .gte("date", from)
    .lte("date", to);

  if (readError) return { message: `Planning illisible : ${readError.message}` };

  const selected = new Set(dates);
  const existing = (window ?? []).filter((row) => selected.has(row.date));

  const check = validateBulkEdit(
    { action, dates, price },
    { current: existing, minPrice: listing.min_price },
  );

  if (!check.ok) return { message: check.message };

  const byDate = new Map(existing.map((row) => [row.date, row]));

  const rows = check.dates.map((date) => {
    const current = byDate.get(date);
    // Fermer ne doit pas effacer le tarif : le partenaire qui rouvre la date
    // retrouve ce qu'il avait saisi.
    const kept = current?.price ?? null;

    return {
      listing_id: listingId,
      date,
      slot: PLANNING_SLOT,
      status: action === "close" ? ("closed" as const) : ("open" as const),
      price: action === "reset-price" ? null : action === "open" ? (price ?? kept) : kept,
      inventory: current?.inventory ?? 1,
    };
  });

  const { data: written, error } = await supabase
    .from("availabilities")
    .upsert(rows, { onConflict: "listing_id,date,slot" })
    .select("id");

  // Le déclencheur `app.enforce_min_price` parle déjà français : on relaie son
  // message plutôt que de le reformuler.
  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  // Rappel : une ligne masquée par la RLS ne lève pas d'erreur, l'écriture
  // touche simplement moins de lignes que prévu.
  if ((written?.length ?? 0) !== rows.length) {
    return { message: "Certaines dates n'ont pas pu être enregistrées. Réessayez." };
  }

  revalidatePath("/pro/planning");
  revalidatePath("/pro/dashboard");

  return { ok: true, message: confirmation(action, check.dates, price) };
}

function confirmation(action: PlanningAction, dates: string[], price: number | null): string {
  const count = dates.length;
  const what = count === 1 ? `Le ${dayLabel(dates[0])}` : `${count} dates`;

  if (action === "close") {
    return count === 1
      ? `${what} est fermé : il n'apparaît plus dans les recherches.`
      : `${what} fermées : elles n'apparaissent plus dans les recherches.`;
  }

  if (action === "reset-price") {
    return count === 1
      ? `${what} revient au tarif de base de l'annonce.`
      : `${what} reviennent au tarif de base de l'annonce.`;
  }

  const tariff = price != null ? ", au tarif indiqué" : "";

  return count === 1
    ? `${what} est ouvert à la réservation${tariff}.`
    : `${what} ouvertes à la réservation${tariff}.`;
}
