import "server-only";

import type { Database } from "@/types/database";
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

/** Les états d'une demande, tels que les nomme l'énumération Postgres. */
export type RequestStatus = Database["public"]["Enums"]["quote_request_status"];

/**
 * Tous les appels d'offres de la plateforme.
 *
 * L'administration n'a pas ici de décision à prendre — la RLS lui ouvre les
 * demandes en lecture, pas les devis des partenaires, qui restent scellés
 * jusqu'à leur envoi. L'écran sert à **voir ce qui se grippe** : une demande
 * ouverte depuis trois jours sans la moindre offre, une échéance dépassée, un
 * appel d'offres attribué qu'on peut citer en exemple.
 *
 * On compte les offres reçues sans en révéler le contenu : c'est le seul
 * chiffre nécessaire pour repérer une demande qui n'intéresse personne.
 *
 * ⚠️ **Un devis ne se rattache pas à la demande, mais à l'une de ses
 * prestations** (`quotes.item_id`). `quotes(count)` depuis `quote_requests`
 * échoue donc — « no relationship found » — et le comptage passe par les
 * items. Deux clés étrangères relient `quotes` et `quote_request_items` : sans
 * l'indication `!quotes_item_id_fkey`, PostgREST refuse de choisir. La même
 * convention vit dans `quotes.ts` sous le nom `BY_ITEM`.
 */
export async function getAllRequests(status?: RequestStatus) {
  const supabase = await createClient();

  let query = supabase
    .from("quote_requests")
    .select(
      `id, reference, title, event_type, event_date, city, guests, budget_max, currency,
       status, respond_by, published_at, created_at,
       profiles:requester_id(full_name),
       organizations(brand_name, legal_name),
       quote_request_items(id, categories(name), quotes!quotes_item_id_fkey(count))`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) throw new Error(`Demandes illisibles : ${error.message}`);

  return data ?? [];
}

export type AdminRequest = Awaited<ReturnType<typeof getAllRequests>>[number];

/** Compteurs par état, pour les onglets de filtrage. */
export async function getRequestCounts() {
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_requests").select("status, respond_by");

  if (error) throw new Error(`Compteurs illisibles : ${error.message}`);

  const maintenant = Date.now();

  return {
    // Rendu à l'appelant : comparer des échéances exige un instant de
    // référence, et `Date.now()` est interdit dans le rendu d'un composant.
    maintenant,
    total: data.length,
    open: data.filter((r) => r.status === "open").length,
    awarded: data.filter((r) => r.status === "awarded").length,
    // Une échéance dépassée alors que la demande est encore ouverte : le client
    // attend une réponse que le système ne réclamera jamais.
    enRetard: data.filter(
      (r) => r.status === "open" && r.respond_by != null && new Date(r.respond_by).getTime() < maintenant,
    ).length,
  };
}
