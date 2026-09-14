import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Lectures du back-office partenaire.
 *
 * La RLS restreint déjà chaque requête à l'organisation de l'appelant. Le
 * filtre `org_id` explicite qu'on ajoute ici n'est donc pas ce qui protège —
 * c'est une seconde barrière, et surtout ce qui rend la requête juste quand un
 * compte appartient à plusieurs organisations.
 */

export interface PartnerListingRow {
  id: string;
  slug: string;
  title: string;
  city: string;
  kind: "venue" | "service";
  status: "draft" | "pending" | "approved" | "rejected" | "archived";
  is_paused: boolean;
  price_from: number | null;
  min_price: number | null;
  cover_url: string | null;
  moderation_notes: string | null;
  published_at: string | null;
  updated_at: string;
  categories: { slug: string; name: string } | null;
}

export async function getPartnerListings(orgId: string): Promise<PartnerListingRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `id, slug, title, city, kind, status, is_paused, price_from, min_price,
       cover_url, moderation_notes, published_at, updated_at,
       categories(slug, name)`,
    )
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Annonces illisibles : ${error.message}`);

  return (data ?? []) as unknown as PartnerListingRow[];
}

export async function getPartnerListing(orgId: string, listingId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `*,
       categories(id, slug, name, kind),
       venue_details(*),
       service_details(*),
       pricing_rules(id, unit, base_price, weekend_multiplier),
       cancellation_policies(id, slug, name, summary),
       listing_media(id, storage_path, alt, position)`,
    )
    .eq("org_id", orgId)
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw new Error(`Annonce illisible : ${error.message}`);

  return data;
}

export type PartnerListingDetail = NonNullable<Awaited<ReturnType<typeof getPartnerListing>>>;

/** Indicateurs du tableau de bord partenaire. */
export async function getPartnerStats(orgId: string) {
  const supabase = await createClient();

  const [listings, openDays, profile] = await Promise.all([
    supabase.from("listings").select("status, is_paused").eq("org_id", orgId),
    supabase
      .from("availabilities")
      .select("listing_id, listings!inner(org_id)", { count: "exact", head: true })
      .eq("status", "open")
      .gte("date", new Date().toISOString().slice(0, 10))
      .eq("listings.org_id", orgId),
    supabase
      .from("partner_profiles")
      .select("is_verified, rating_avg, rating_count, response_time_avg_h")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const rows = listings.data ?? [];

  return {
    total: rows.length,
    published: rows.filter((r) => r.status === "approved" && !r.is_paused).length,
    pending: rows.filter((r) => r.status === "pending").length,
    drafts: rows.filter((r) => r.status === "draft").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    openDays: openDays.count ?? 0,
    isVerified: profile.data?.is_verified ?? false,
    ratingAvg: profile.data?.rating_avg ?? null,
    ratingCount: profile.data?.rating_count ?? 0,
  };
}

/** Référentiels nécessaires aux formulaires d'annonce. */
export async function getListingFormOptions() {
  const supabase = await createClient();

  const [categories, cities, policies] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, kind, parent_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("cities").select("slug, name").eq("is_active", true).order("sort_order"),
    supabase.from("cancellation_policies").select("id, slug, name, summary").order("slug"),
  ]);

  const rows = categories.data ?? [];

  return {
    // Seules les sous-catégories sont sélectionnables : publier sous « Lieux »
    // sans préciser s'il s'agit d'une villa ou d'une salle n'aiderait personne
    // à vous trouver.
    categoryGroups: rows
      .filter((c) => c.parent_id === null)
      .map((family) => ({
        slug: family.slug,
        name: family.name,
        kind: family.kind,
        children: rows
          .filter((child) => child.parent_id === family.id)
          .map((child) => ({ id: child.id, slug: child.slug, name: child.name })),
      })),
    cities: cities.data ?? [],
    policies: policies.data ?? [],
  };
}

/** Planning d'une annonce, sur la fenêtre demandée. */
export async function getListingAvailabilities(listingId: string, from: string, to: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("availabilities")
    .select("id, date, slot, status, price, inventory")
    .eq("listing_id", listingId)
    .gte("date", from)
    .lte("date", to)
    .order("date");

  if (error) throw new Error(`Planning illisible : ${error.message}`);

  return data ?? [];
}
