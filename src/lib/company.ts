import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Lectures de l'espace entreprise.
 *
 * Ce qui distingue une entreprise d'un particulier n'est pas le volume, c'est
 * que **la personne qui choisit n'est pas celle qui paie**. Toutes les lectures
 * d'ici sont donc portées par l'organisation, jamais par l'utilisateur : un
 * collègue qui reprend un dossier doit voir exactement la même chose.
 *
 * La RLS restreint déjà à l'organisation de l'appelant ; le filtre `org_id`
 * explicite est une seconde barrière, et rend la requête juste quand un compte
 * appartient à plusieurs organisations.
 */

// -----------------------------------------------------------------------------
// Budgets
// -----------------------------------------------------------------------------

export async function getBudgetUsage(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("company_budget_usage")
    .select("*")
    .eq("org_id", orgId)
    .order("code");

  if (error) throw new Error(`Budgets illisibles : ${error.message}`);

  return data ?? [];
}

export type BudgetUsage = Awaited<ReturnType<typeof getBudgetUsage>>[number];

/** Centres de coûts sélectionnables dans un brief. */
export async function getCostCenters(orgId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("cost_centers")
    .select("id, code, name, budget_amount, currency, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("code");

  return data ?? [];
}

// -----------------------------------------------------------------------------
// Validations
// -----------------------------------------------------------------------------

export async function getApprovals(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approvals")
    .select(
      `id, subject, subject_id, amount, currency, status, reason,
       created_at, decided_at,
       cost_centers(code, name),
       requester:profiles!approvals_requested_by_fkey(full_name),
       decider:profiles!approvals_decided_by_fkey(full_name)`,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Validations illisibles : ${error.message}`);

  return data ?? [];
}

export type Approval = Awaited<ReturnType<typeof getApprovals>>[number];

/**
 * Contexte des avals en attente : ce que le valideur doit avoir sous les yeux
 * pour décider sans ouvrir trois écrans.
 *
 * Deux requêtes séparées plutôt qu'une jointure : `approvals.subject_id` pointe
 * tantôt un devis, tantôt une demande. Une clé étrangère polymorphe ne peut pas
 * être suivie par PostgREST — et ne devrait pas l'être.
 */
export async function getApprovalContext(orgId: string, approvals: Approval[]) {
  const supabase = await createClient();

  const quoteIds = approvals.filter((a) => a.subject === "quote").map((a) => a.subject_id);
  const requestIds = approvals
    .filter((a) => a.subject === "quote_request")
    .map((a) => a.subject_id);

  const [quotes, requests] = await Promise.all([
    quoteIds.length
      ? supabase
          .from("quotes")
          .select(
            `id, subtotal, currency, status, message,
             organizations(brand_name, legal_name),
             quote_request_items!quotes_item_id_fkey(
               categories(name),
               quote_requests(id, reference, title, city, event_date)
             )`,
          )
          .in("id", quoteIds)
      : { data: [] },
    requestIds.length
      ? supabase
          .from("quote_requests")
          .select("id, reference, title, city, event_date, budget_max, status")
          .in("id", requestIds)
          .eq("org_id", orgId)
      : { data: [] },
  ]);

  return {
    quotes: new Map((quotes.data ?? []).map((quote) => [quote.id, quote])),
    requests: new Map((requests.data ?? []).map((request) => [request.id, request])),
  };
}

// -----------------------------------------------------------------------------
// Demandes et offres de l'organisation
// -----------------------------------------------------------------------------

export async function getCompanyRequests(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      `id, reference, title, event_type, event_date, city, guests, budget_max,
       currency, status, respond_by, created_at,
       cost_centers(code, name),
       requester:profiles!quote_requests_requester_id_fkey(full_name),
       quote_request_items(
         id, awarded_quote_id,
         categories(name),
         quotes!quotes_item_id_fkey(id, status, subtotal)
       )`,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Projets illisibles : ${error.message}`);

  return data ?? [];
}

export type CompanyRequest = Awaited<ReturnType<typeof getCompanyRequests>>[number];

/** Prestataires retenus : ceux avec qui l'entreprise a déjà travaillé. */
export async function getSuppliers(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      `id, subtotal, currency, decided_at,
       organizations(id, slug, brand_name, legal_name, city),
       quote_request_items!quotes_item_id_fkey(
         categories(name),
         quote_requests!inner(id, reference, title, org_id)
       )`,
    )
    .eq("status", "accepted")
    .eq("quote_request_items.quote_requests.org_id", orgId)
    .order("decided_at", { ascending: false });

  if (error) throw new Error(`Fournisseurs illisibles : ${error.message}`);

  // Regroupé par prestataire : l'entreprise veut savoir avec qui elle travaille,
  // pas relire la liste de ses commandes.
  const byOrg = new Map<
    string,
    {
      orgId: string;
      name: string;
      city: string | null;
      categories: Set<string>;
      total: number;
      currency: string;
      count: number;
      lastAt: string | null;
    }
  >();

  for (const quote of data ?? []) {
    const org = quote.organizations;
    if (!org) continue;

    const entry = byOrg.get(org.id) ?? {
      orgId: org.id,
      name: org.brand_name ?? org.legal_name,
      city: org.city,
      categories: new Set<string>(),
      total: 0,
      currency: quote.currency ?? "XOF",
      count: 0,
      lastAt: null,
    };

    const category = quote.quote_request_items?.categories?.name;
    if (category) entry.categories.add(category);

    entry.total += quote.subtotal;
    entry.count += 1;
    if (!entry.lastAt || (quote.decided_at ?? "") > entry.lastAt) {
      entry.lastAt = quote.decided_at;
    }

    byOrg.set(org.id, entry);
  }

  return [...byOrg.values()].sort((a, b) => b.total - a.total);
}

// -----------------------------------------------------------------------------
// Équipe et réglages
// -----------------------------------------------------------------------------

export async function getTeam(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_members")
    // Clé nommée : `organization_members` pointe `profiles` deux fois (le
    // membre, et qui l'a invité). Sans indication, PostgREST refuse.
    .select(
      "user_id, role, status, created_at, profiles!organization_members_user_id_fkey(full_name, phone)",
    )
    .eq("org_id", orgId)
    .order("created_at");

  if (error) throw new Error(`Équipe illisible : ${error.message}`);

  return data ?? [];
}

export async function getCompanySettings(orgId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("company_settings")
    .select("approval_threshold, approve_publication, currency")
    .eq("org_id", orgId)
    .maybeSingle();

  return data;
}

/** Devis déjà soumis à un valideur, pour ne pas proposer deux fois l'aval. */
export async function getPendingQuoteApprovals(orgId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("approvals")
    .select("subject_id")
    .eq("org_id", orgId)
    .eq("subject", "quote")
    .eq("status", "pending");

  return (data ?? []).map((row) => row.subject_id);
}

export async function getCompanyProfile(orgId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("organizations")
    .select("id, legal_name, brand_name, city, phone, billing_email, address, rccm, ifu, country, status")
    .eq("id", orgId)
    .maybeSingle();

  return data;
}

// -----------------------------------------------------------------------------
// Tableau de bord
// -----------------------------------------------------------------------------

export async function getCompanyOverview(orgId: string) {
  const supabase = await createClient();

  const [requests, approvals, budgets] = await Promise.all([
    supabase.from("quote_requests").select("status").eq("org_id", orgId),
    supabase.from("approvals").select("status, amount").eq("org_id", orgId),
    getBudgetUsage(orgId),
  ]);

  const rows = requests.data ?? [];
  const pending = (approvals.data ?? []).filter((a) => a.status === "pending");

  return {
    drafts: rows.filter((r) => r.status === "draft").length,
    awaitingApproval: rows.filter((r) => r.status === "pending_approval").length,
    open: rows.filter((r) => r.status === "open").length,
    awarded: rows.filter((r) => r.status === "awarded").length,
    pendingApprovals: pending.length,
    pendingAmount: pending.reduce((total, a) => total + (a.amount ?? 0), 0),
    committed: budgets.reduce((total, b) => total + Number(b.committed ?? 0), 0),
    envelope: budgets.reduce((total, b) => total + Number(b.budget_amount ?? 0), 0),
    costCenters: budgets.length,
  };
}
