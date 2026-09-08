"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSpace } from "@/lib/auth/session";
import { fieldErrors, optionalNumber, optionalText } from "@/lib/validation/listing";
import { quoteHeaderSchema, quoteLineSchema } from "@/lib/validation/quote";
import { createClient } from "@/utils/supabase/server";

/**
 * Rédaction et envoi d'une proposition.
 *
 * L'organisation vient de la session. Le total, lui, n'est jamais transmis :
 * il est recalculé en base à chaque mouvement de ligne. Un devis dont le total
 * ne correspond pas à son détail est la première cause de litige.
 */

export interface QuoteState {
  errors?: Record<string, string>;
  message?: string;
  ok?: boolean;
}

async function requirePartnerOrg(): Promise<string> {
  const { decision } = await requireSpace("partner", "/pro/connexion");

  if (!decision.granted || !decision.org) {
    throw new Error("Aucune organisation partenaire active.");
  }

  return decision.org.orgId;
}

/** Ouvre un brouillon de devis sur un besoin, ou rouvre celui qui existe. */
export async function startQuote(_previous: QuoteState, formData: FormData): Promise<QuoteState> {
  const orgId = await requirePartnerOrg();
  const itemId = String(formData.get("itemId") ?? "");

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("item_id", itemId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) redirect(`/pro/devis/${existing.id}`);

  const { data, error } = await supabase
    .from("quotes")
    .insert({ item_id: itemId, org_id: orgId })
    .select("id")
    .single();

  // La RLS refuse l'insertion si le besoin n'est pas visible du partenaire :
  // catégorie hors de son offre, demande close, ou annonce d'un concurrent.
  if (error) return { message: `Devis impossible : ${error.message}` };

  revalidatePath("/pro/demandes");
  redirect(`/pro/devis/${data.id}`);
}

export async function saveQuoteHeader(
  _previous: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  const orgId = await requirePartnerOrg();
  const quoteId = String(formData.get("quoteId") ?? "");

  const parsed = quoteHeaderSchema.safeParse({
    message: optionalText(formData.get("message")) ?? "",
    validUntil: optionalText(formData.get("validUntil")) ?? "",
    listingId: optionalText(formData.get("listingId")) ?? "",
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .update({
      message: parsed.data.message || null,
      valid_until: parsed.data.validUntil || null,
      listing_id: parsed.data.listingId || null,
    })
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .select("id");

  if (error) return { message: `Enregistrement impossible : ${error.message}` };
  if (!data || data.length === 0) return { message: "Devis introuvable." };

  revalidatePath(`/pro/devis/${quoteId}`);
  return { ok: true, message: "Devis enregistré." };
}

export async function addQuoteLine(
  _previous: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  const orgId = await requirePartnerOrg();
  const quoteId = String(formData.get("quoteId") ?? "");

  const parsed = quoteLineSchema.safeParse({
    label: formData.get("label"),
    description: optionalText(formData.get("description")) ?? "",
    quantity: optionalNumber(formData.get("quantity")) ?? 1,
    unit: formData.get("unit"),
    unitPrice: optionalNumber(formData.get("unitPrice")),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!quote) return { message: "Devis introuvable." };
  if (quote.status !== "draft") {
    return { message: "Ce devis est déjà envoyé : ses lignes ne peuvent plus changer." };
  }

  const { count } = await supabase
    .from("quote_lines")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quoteId);

  const { error } = await supabase.from("quote_lines").insert({
    quote_id: quoteId,
    position: count ?? 0,
    label: parsed.data.label,
    description: parsed.data.description || null,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    unit_price: parsed.data.unitPrice,
  });

  if (error) return { message: `Ligne non ajoutée : ${error.message}` };

  revalidatePath(`/pro/devis/${quoteId}`);
  return { ok: true, message: "Ligne ajoutée." };
}

export async function removeQuoteLine(
  _previous: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  await requirePartnerOrg();

  const quoteId = String(formData.get("quoteId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_lines")
    .delete()
    .eq("id", lineId)
    .eq("quote_id", quoteId)
    .select("id");

  if (error) return { message: `Suppression impossible : ${error.message}` };
  if (!data || data.length === 0) {
    return { message: "Ligne introuvable, ou devis déjà envoyé." };
  }

  revalidatePath(`/pro/devis/${quoteId}`);
  return { ok: true, message: "Ligne retirée." };
}

export async function sendQuote(_previous: QuoteState, formData: FormData): Promise<QuoteState> {
  const orgId = await requirePartnerOrg();
  const quoteId = String(formData.get("quoteId") ?? "");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "sent" })
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .select("id");

  // Le déclencheur refuse un devis sans montant, et parle déjà français.
  if (error) return { message: error.message.replace(/^.*?:\s*/, "") };
  if (!data || data.length === 0) return { message: "Devis introuvable." };

  revalidatePath(`/pro/devis/${quoteId}`);
  revalidatePath("/pro/devis");
  revalidatePath("/pro/demandes");

  return { ok: true, message: "Devis envoyé. Le client le compare aux autres offres reçues." };
}

export async function withdrawQuote(
  _previous: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  const orgId = await requirePartnerOrg();
  const quoteId = String(formData.get("quoteId") ?? "");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .select("id");

  if (error) return { message: error.message.replace(/^.*?:\s*/, "") };
  if (!data || data.length === 0) return { message: "Devis introuvable." };

  revalidatePath("/pro/devis");
  return { ok: true, message: "Devis retiré." };
}
