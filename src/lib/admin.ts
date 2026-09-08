import "server-only";

import { createClient } from "@/utils/supabase/server";

/** Lectures du back-office ÉniEvent. La RLS n'ouvre ces vues qu'aux administrateurs. */

export async function getModerationQueue() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `id, slug, title, description, city, district, kind, status, price_from, min_price,
       payment_terms, updated_at, cover_url,
       categories(name), organizations(slug, brand_name, legal_name, city),
       venue_details(capacity_seated, capacity_standing),
       service_details(min_guests, max_guests),
       pricing_rules(unit, base_price)`,
    )
    .eq("status", "pending")
    // Les plus anciennes d'abord : un partenaire qui attend depuis trois jours
    // passe avant celui qui vient de soumettre.
    .order("updated_at", { ascending: true });

  if (error) throw new Error(`File de modération illisible : ${error.message}`);

  return data ?? [];
}

export type ModerationItem = Awaited<ReturnType<typeof getModerationQueue>>[number];

export async function getAdminOverview() {
  const supabase = await createClient();

  const [pending, approved, partners, unverified] = await Promise.all([
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("is_paused", false),
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("type", "partner"),
    supabase
      .from("partner_profiles")
      .select("org_id", { count: "exact", head: true })
      .eq("is_verified", false),
  ]);

  return {
    pending: pending.count ?? 0,
    published: approved.count ?? 0,
    partners: partners.count ?? 0,
    unverifiedPartners: unverified.count ?? 0,
  };
}
