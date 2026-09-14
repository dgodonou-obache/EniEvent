"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { normaliseBeninPhone } from "@/lib/validation/phone";
import {
  APPROVER_ROLES,
  approvalDecisionSchema,
  companyProfileSchema,
  companySettingsSchema,
  costCenterSchema,
} from "@/lib/validation/company";
import { fieldErrors, optionalNumber, optionalText } from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";

/**
 * Écritures de l'espace entreprise.
 *
 * L'organisation vient de la session. Les décisions d'aval, elles, ne passent
 * pas par un UPDATE : approuver un engagement accepte le devis, refuse ses
 * concurrents et attribue le besoin — dans une seule transaction, côté base.
 */

export interface CompanyState {
  errors?: Record<string, string>;
  message?: string;
  ok?: boolean;
}

async function requireCompany() {
  const { decision } = await requireSpace("company", "/connexion");

  if (!decision.granted || !decision.org) {
    throw new Error("Aucune entreprise active.");
  }

  return decision.org;
}

/** Les rôles qui engagent l'entreprise, contrôlés avant d'afficher un bouton. */
export async function canApprove(): Promise<boolean> {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return false;
  return APPROVER_ROLES.includes(decision.org.role);
}

// -----------------------------------------------------------------------------
// Centres de coûts
// -----------------------------------------------------------------------------

export async function saveCostCenter(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const org = await requireCompany();
  const costCenterId = optionalText(formData.get("costCenterId"));

  const parsed = costCenterSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    budgetAmount: optionalNumber(formData.get("budgetAmount")),
    periodStart: optionalText(formData.get("periodStart")) ?? "",
    periodEnd: optionalText(formData.get("periodEnd")) ?? "",
    isActive: formData.get("isActive") !== "false",
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const row = {
    org_id: org.orgId,
    code: parsed.data.code,
    name: parsed.data.name,
    budget_amount: parsed.data.budgetAmount ?? null,
    period_start: parsed.data.periodStart || null,
    period_end: parsed.data.periodEnd || null,
    is_active: parsed.data.isActive ?? true,
  };

  const { data, error } = costCenterId
    ? await supabase
        .from("cost_centers")
        .update(row)
        .eq("id", costCenterId)
        .eq("org_id", org.orgId)
        .select("id")
    : await supabase.from("cost_centers").insert(row).select("id");

  if (error) {
    // Le code identifie le centre dans toute l'entreprise : le doublon est la
    // seule erreur que l'utilisateur peut corriger lui-même.
    if (error.code === "23505") {
      return { errors: { code: "Ce code est déjà utilisé par un autre centre de coût." } };
    }
    return { message: `Enregistrement impossible : ${error.message}` };
  }

  // Rappel : une ligne masquée par la RLS ne lève pas d'erreur, l'écriture
  // touche simplement 0 ligne.
  if (!data || data.length === 0) return { message: "Centre de coût introuvable." };

  revalidatePath("/entreprise/budgets");
  revalidatePath("/entreprise");

  return { ok: true, message: costCenterId ? "Centre de coût mis à jour." : "Centre de coût créé." };
}

export async function toggleCostCenter(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const org = await requireCompany();
  const costCenterId = String(formData.get("costCenterId") ?? "");
  const active = formData.get("active") === "true";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cost_centers")
    .update({ is_active: active })
    .eq("id", costCenterId)
    .eq("org_id", org.orgId)
    .select("id");

  if (error) return { message: `Action impossible : ${error.message}` };
  if (!data || data.length === 0) return { message: "Centre de coût introuvable." };

  revalidatePath("/entreprise/budgets");

  return {
    ok: true,
    message: active
      ? "Centre de coût réactivé."
      : "Centre de coût archivé : il n'est plus proposé dans les nouvelles demandes.",
  };
}

// -----------------------------------------------------------------------------
// Validations
// -----------------------------------------------------------------------------

export async function decideApproval(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  await requireCompany();

  const approvalId = String(formData.get("approvalId") ?? "");
  const approve = formData.get("decision") === "approve";

  const parsed = approvalDecisionSchema.safeParse({
    approve,
    reason: optionalText(formData.get("reason")) ?? "",
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // `decide_approval` vérifie elle-même le rôle : elle est SECURITY DEFINER et
  // contourne la RLS, l'autorisation ne peut donc pas être déléguée à celle-ci.
  const { error } = await supabase.rpc("decide_approval", {
    target: approvalId,
    p_approve: approve,
    p_reason: parsed.data.reason || undefined,
  });

  if (error) return { message: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/entreprise/validations");
  revalidatePath("/entreprise/projets");
  revalidatePath("/entreprise/budgets");
  revalidatePath("/entreprise");

  return {
    ok: true,
    message: approve
      ? "Aval accordé. L'offre est retenue et le prestataire en est informé."
      : "Refus enregistré. Le demandeur reçoit votre motif.",
  };
}

/** Demande l'aval d'un valideur sur une offre au-dessus du seuil. */
export async function requestQuoteApproval(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  await requireCompany();

  const quoteId = String(formData.get("quoteId") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.rpc("request_quote_approval", { target: quoteId });

  if (error) return { message: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/entreprise/validations");
  revalidatePath("/projets");

  return { ok: true, message: "Aval demandé. Vos valideurs le voient dès maintenant." };
}

// -----------------------------------------------------------------------------
// Réglages
// -----------------------------------------------------------------------------

export async function saveCompanySettings(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const org = await requireCompany();

  const parsed = companySettingsSchema.safeParse({
    approvalThreshold: optionalNumber(formData.get("approvalThreshold")),
    approvePublication: formData.get("approvePublication") === "on",
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("company_settings")
    .upsert(
      {
        org_id: org.orgId,
        approval_threshold: parsed.data.approvalThreshold ?? null,
        approve_publication: parsed.data.approvePublication ?? false,
      },
      { onConflict: "org_id" },
    )
    .select("org_id");

  if (error) return { message: `Enregistrement impossible : ${error.message}` };
  if (!data || data.length === 0) {
    return { message: "Seuls le propriétaire, un administrateur ou la finance peuvent régler ceci." };
  }

  revalidatePath("/entreprise/parametres");
  revalidatePath("/entreprise");

  return { ok: true, message: "Réglages enregistrés." };
}

export async function saveCompanyProfile(
  _previous: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const org = await requireCompany();

  const parsed = companyProfileSchema.safeParse({
    legalName: formData.get("legalName"),
    brandName: optionalText(formData.get("brandName")) ?? "",
    city: formData.get("city"),
    phone: optionalText(formData.get("phone")) ?? "",
    billingEmail: optionalText(formData.get("billingEmail")) ?? "",
    address: optionalText(formData.get("address")) ?? "",
    rccm: optionalText(formData.get("rccm")) ?? "",
    ifu: optionalText(formData.get("ifu")) ?? "",
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .update({
      legal_name: parsed.data.legalName,
      brand_name: parsed.data.brandName || null,
      city: parsed.data.city,
      phone: parsed.data.phone ? normaliseBeninPhone(parsed.data.phone) : null,
      billing_email: parsed.data.billingEmail || null,
      address: parsed.data.address || null,
      rccm: parsed.data.rccm || null,
      ifu: parsed.data.ifu || null,
    })
    .eq("id", org.orgId)
    .select("id");

  if (error) return { message: `Enregistrement impossible : ${error.message}` };
  if (!data || data.length === 0) {
    return { message: "Seuls le propriétaire ou un administrateur peuvent modifier la fiche." };
  }

  revalidatePath("/entreprise/parametres");

  return { ok: true, message: "Fiche entreprise enregistrée." };
}
