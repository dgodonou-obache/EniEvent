"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getSessionContext } from "@/lib/auth/session";
import { normaliseBeninPhone } from "@/lib/validation/phone";
import { briefSchema } from "@/lib/validation/quote";
import { fieldErrors, optionalNumber, optionalText } from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";

/**
 * Dépôt d'un appel d'offres.
 *
 * Le demandeur vient de la session, jamais du formulaire — accepter un
 * `requester_id` posté permettrait de déposer une demande au nom d'un autre.
 * L'entreprise éventuelle est déduite de l'appartenance de l'utilisateur, et
 * la RLS refuserait de toute façon une organisation dont il n'est pas membre.
 */

export interface BriefState {
  errors?: Record<string, string>;
  message?: string;
}

export async function submitBrief(
  _previous: BriefState,
  formData: FormData,
): Promise<BriefState> {
  const user = await requireUser("/connexion?suite=/demande-de-devis");

  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);

  const parsed = briefSchema.safeParse({
    title: formData.get("title"),
    eventType: formData.get("eventType"),
    eventDate: optionalText(formData.get("eventDate")) ?? "",
    isDateFlexible: formData.get("isDateFlexible") === "on",
    city: formData.get("city"),
    district: optionalText(formData.get("district")) ?? "",
    guests: optionalNumber(formData.get("guests")),
    budgetMax: optionalNumber(formData.get("budgetMax")),
    description: formData.get("description"),
    contactPhone: optionalText(formData.get("contactPhone")) ?? "",
    categoryIds,
    // Un champ vide vaut « je ne sais pas encore », pas zéro : `optionalNumber`
    // rend `undefined`, et le budget de la prestation reste nul en base.
    categoryBudgets: categoryIds.map((categoryId) => ({
      categoryId,
      budgetMax: optionalNumber(formData.get(`budget-${categoryId}`)),
    })),
    responseWindowHours: optionalNumber(formData.get("responseWindowHours")) ?? 48,
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const brief = parsed.data;
  const supabase = await createClient();

  // Une demande portée par une entreprise se rattache à elle : la facturation
  // centralisée en dépendra. Un particulier n'a pas d'organisation.
  const context = await getSessionContext();
  const companyOrgId =
    context?.memberships.find(
      (membership) => membership.orgType === "company" && membership.memberStatus === "active",
    )?.orgId ?? null;

  const respondBy = new Date(Date.now() + brief.responseWindowHours * 3_600_000).toISOString();

  const { data: created, error } = await supabase
    .from("quote_requests")
    .insert({
      requester_id: user.id,
      org_id: companyOrgId,
      title: brief.title,
      event_type: brief.eventType,
      event_date: brief.eventDate || null,
      is_date_flexible: brief.isDateFlexible ?? false,
      city: brief.city,
      district: brief.district || null,
      guests: brief.guests ?? null,
      budget_max: brief.budgetMax ?? null,
      description: brief.description,
      contact_phone: brief.contactPhone ? normaliseBeninPhone(brief.contactPhone) : null,
      respond_by: respondBy,
    })
    .select("id")
    .single();

  if (error) return { message: `Demande non enregistrée : ${error.message}` };

  const budgetByCategory = new Map(
    (brief.categoryBudgets ?? []).map((budget) => [budget.categoryId, budget.budgetMax]),
  );

  const { error: itemsError } = await supabase.from("quote_request_items").insert(
    brief.categoryIds.map((categoryId) => ({
      request_id: created.id,
      category_id: categoryId,
      budget_max: budgetByCategory.get(categoryId) ?? null,
    })),
  );

  if (itemsError) {
    // Une demande sans besoin n'atteindrait personne : mieux vaut la retirer
    // que la laisser en brouillon muet.
    await supabase.from("quote_requests").delete().eq("id", created.id);
    return { message: `Demande non enregistrée : ${itemsError.message}` };
  }

  // La publication est une transition d'état : le déclencheur pose la date de
  // publication et la date limite de réponse.
  const { error: publishError } = await supabase
    .from("quote_requests")
    .update({ status: "open" })
    .eq("id", created.id);

  if (publishError) return { message: `Publication impossible : ${publishError.message}` };

  revalidatePath("/projets");
  redirect(`/projets/${created.id}`);
}
