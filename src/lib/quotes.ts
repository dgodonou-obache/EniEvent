import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Lectures de l'appel d'offres.
 *
 * Presque tout le cloisonnement est fait par la RLS : un partenaire qui
 * interroge `quotes` ne peut structurellement pas remonter l'offre d'un
 * concurrent, y compris dans une sélection imbriquée. Les filtres explicites
 * ajoutés ici ne remplacent pas cette protection — ils la doublent, et rendent
 * la requête juste quand un compte appartient à plusieurs organisations.
 *
 * ⚠️ Deux clés étrangères relient `quotes` et `quote_request_items` : le devis
 * pointe son besoin (`item_id`), et le besoin pointe le devis retenu
 * (`awarded_quote_id`). L'imbrication est donc ambiguë et doit toujours nommer
 * la clé à suivre — `quotes!quotes_item_id_fkey(...)`. Sans cela PostgREST
 * refuse la requête, ou pire, suit la mauvaise relation.
 */

/** Clé étrangère « le devis répond à ce besoin », à distinguer du devis retenu. */
const BY_ITEM = "!quotes_item_id_fkey";

// -----------------------------------------------------------------------------
// Côté client
// -----------------------------------------------------------------------------

export async function getMyRequests() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      `id, reference, title, event_type, event_date, event_end_date, is_date_flexible,
       city, guests, budget_max, currency, status, respond_by, published_at, created_at,
       quote_request_items(
         id, awarded_quote_id,
         categories(name, slug),
         quotes${BY_ITEM}(id, status)
       )`,
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Demandes illisibles : ${error.message}`);

  return data ?? [];
}

export type RequestSummary = Awaited<ReturnType<typeof getMyRequests>>[number];

export async function getRequestDetail(requestId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      `id, reference, title, event_type, event_date, event_end_date, is_date_flexible,
       city, district, guests, budget_min, budget_max, currency, description,
       contact_phone, status, respond_by, published_at, created_at,
       quote_request_items(
         id, quantity, budget_max, notes, listing_id, awarded_quote_id,
         categories(id, name, slug),
         quotes${BY_ITEM}(
           id, reference, status, subtotal, currency, message, valid_until,
           sent_at, decided_at, decline_reason, listing_id,
           organizations(slug, brand_name, legal_name, city),
           quote_lines(id, position, label, description, quantity, unit, unit_price, line_total)
         )
       )`,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new Error(`Demande illisible : ${error.message}`);

  return data;
}

export type RequestDetail = NonNullable<Awaited<ReturnType<typeof getRequestDetail>>>;

/** Référentiels du formulaire de brief. */
export async function getBriefOptions() {
  const supabase = await createClient();

  const [categories, cities] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, kind, parent_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("cities").select("slug, name").eq("is_active", true).order("sort_order"),
  ]);

  const rows = categories.data ?? [];

  return {
    // Comme pour les annonces, seules les sous-catégories sont sélectionnables :
    // demander « un lieu » sans préciser n'aiguille personne.
    families: rows
      .filter((category) => category.parent_id === null)
      .map((family) => ({
        slug: family.slug,
        name: family.name,
        kind: family.kind,
        children: rows
          .filter((child) => child.parent_id === family.id)
          .map((child) => ({ id: child.id, slug: child.slug, name: child.name })),
      }))
      .filter((family) => family.children.length > 0),
    cities: cities.data ?? [],
  };
}

// -----------------------------------------------------------------------------
// Côté partenaire
// -----------------------------------------------------------------------------

/**
 * Les besoins ouverts qu'un partenaire peut servir.
 *
 * La sélection ne filtre pas sur la catégorie ni sur la ville : c'est
 * `app.partner_can_see_item`, côté base, qui décide. Refaire ce calcul ici
 * risquerait de diverger — et de montrer une demande que l'écran suivant
 * refuserait.
 */
export async function getPartnerOpportunities(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_request_items")
    .select(
      `id, quantity, budget_max, notes, listing_id, awarded_quote_id,
       categories(name, slug),
       quote_requests!inner(
         id, reference, title, event_type, event_date, event_end_date,
         is_date_flexible, city, district, guests, budget_max, currency,
         description, status, respond_by, created_at
       ),
       quotes${BY_ITEM}(id, org_id, status, subtotal, sent_at)`,
    )
    .eq("quote_requests.status", "open")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) throw new Error(`Demandes illisibles : ${error.message}`);

  // `quotes` imbriqué ne peut contenir que les devis du partenaire — la RLS
  // masque ceux des concurrents. Le filtre sur `org_id` couvre le cas d'un
  // compte rattaché à plusieurs organisations.
  return (data ?? []).map((item) => ({
    ...item,
    myQuote: (item.quotes ?? []).find((quote) => quote.org_id === orgId) ?? null,
  }));
}

export type Opportunity = Awaited<ReturnType<typeof getPartnerOpportunities>>[number];

export async function getPartnerQuotes(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      `id, reference, status, subtotal, currency, valid_until, sent_at, decided_at,
       decline_reason, created_at,
       quote_request_items${BY_ITEM}(
         id,
         categories(name, slug),
         quote_requests(id, reference, title, city, event_date, status, respond_by)
       )`,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Devis illisibles : ${error.message}`);

  return data ?? [];
}

export type PartnerQuote = Awaited<ReturnType<typeof getPartnerQuotes>>[number];

export async function getQuoteForEdit(orgId: string, quoteId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      `id, reference, status, subtotal, currency, message, valid_until, listing_id,
       sent_at, decided_at, decline_reason,
       quote_lines(id, position, label, description, quantity, unit, unit_price, line_total),
       quote_request_items${BY_ITEM}(
         id, quantity, budget_max, notes, listing_id,
         categories(id, name, slug),
         quote_requests(
           id, reference, title, event_type, event_date, event_end_date,
           is_date_flexible, city, district, guests, budget_max, currency,
           description, status, respond_by
         )
       )`,
    )
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Devis illisible : ${error.message}`);

  return data;
}

export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuoteForEdit>>>;

/** Annonces publiées du partenaire, pour rattacher un devis à une offre. */
export async function getPartnerListingChoices(orgId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select("id, title, slug, category_id")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .order("title");

  return data ?? [];
}

/** Compteurs du tableau de bord partenaire liés à l'appel d'offres. */
export async function getPartnerQuoteStats(orgId: string) {
  const supabase = await createClient();

  const [opportunities, quotes] = await Promise.all([
    supabase
      .from("quote_request_items")
      .select("id, quote_requests!inner(status)", { count: "exact", head: true })
      .eq("quote_requests.status", "open"),
    supabase.from("quotes").select("status").eq("org_id", orgId),
  ]);

  const rows = quotes.data ?? [];

  return {
    openRequests: opportunities.count ?? 0,
    drafts: rows.filter((row) => row.status === "draft").length,
    sent: rows.filter((row) => row.status === "sent").length,
    accepted: rows.filter((row) => row.status === "accepted").length,
  };
}
