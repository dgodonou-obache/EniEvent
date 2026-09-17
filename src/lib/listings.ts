import "server-only";

import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database";

import { PAGE_SIZE, pageRange, type SearchFilters } from "./search";

/**
 * Accès au catalogue.
 *
 * Toutes les lectures passent par la RLS : un brouillon reste invisible même si
 * une requête l'oubliait. Les filtres viennent de l'URL et ont déjà été
 * assainis par `search.ts` — ce module ne fait plus que traduire en SQL.
 */

type SearchViewRow = Database["public"]["Views"]["listing_search"]["Row"];

/**
 * Une vue Postgres ne transporte pas les contraintes `NOT NULL` de ses tables :
 * les types générés rendent donc `slug`, `title` et `city` nullables alors
 * qu'ils ne le sont jamais. Plutôt que de propager cette incertitude dans
 * chaque composant, on la résout ici, une fois.
 */
export interface ListingSummary {
  id: string;
  slug: string;
  title: string;
  city: string;
  district: string | null;
  kind: "venue" | "service" | null;
  cover_url: string | null;
  currency: string | null;
  booking_mode: string | null;
  price_from: number | null;
  /** Unité du tarif affiché : « à partir de 12 000 FCFA **par personne** ». */
  price_from_unit: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  latitude: number | null;
  longitude: number | null;
  category_slug: string | null;
  category_name: string | null;
  family_slug: string | null;
  org_slug: string | null;
  org_name: string | null;
  org_verified: boolean | null;
  max_capacity: number | null;
  amenity_slugs: string[];
}

export interface SearchOutcome {
  rows: ListingSummary[];
  total: number;
  page: number;
  pageCount: number;
}

function toSummary(row: SearchViewRow): ListingSummary | null {
  // Une ligne sans slug est inexploitable (aucune URL possible) : on l'écarte
  // plutôt que de rendre une carte cassée.
  if (!row.id || !row.slug || !row.title || !row.city) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    city: row.city,
    district: row.district,
    kind: row.kind,
    cover_url: row.cover_url,
    currency: row.currency,
    booking_mode: row.booking_mode,
    price_from: row.price_from,
    price_from_unit: row.price_from_unit,
    rating_avg: row.rating_avg,
    rating_count: row.rating_count,
    latitude: row.latitude,
    longitude: row.longitude,
    category_slug: row.category_slug,
    category_name: row.category_name,
    family_slug: row.family_slug,
    org_slug: row.org_slug,
    org_name: row.org_name,
    org_verified: row.org_verified,
    max_capacity: row.max_capacity,
    amenity_slugs: row.amenity_slugs ?? [],
  };
}

const CARD_COLUMNS = [
  "id",
  "slug",
  "title",
  "description",
  "city",
  "district",
  "kind",
  "cover_url",
  "currency",
  "booking_mode",
  "price_from",
  "price_from_unit",
  "rating_avg",
  "rating_count",
  "latitude",
  "longitude",
  "category_slug",
  "category_name",
  "family_slug",
  "org_slug",
  "org_name",
  "org_verified",
  "max_capacity",
  "amenity_slugs",
].join(", ");

export async function searchListings(filters: SearchFilters): Promise<SearchOutcome> {
  const supabase = await createClient();
  const { from, to } = pageRange(filters.page);

  let query = supabase
    .from("listing_search")
    .select(CARD_COLUMNS, { count: "exact" })
    // La RLS suffirait, mais l'expliciter garde l'intention lisible et permet
    // à Postgres d'utiliser l'index partiel sur les annonces publiées.
    .eq("status", "approved")
    .eq("is_paused", false);

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.bookingMode) {
    // `both` accepte les deux tunnels : une annonce réservable immédiatement
    // apparaît aussi bien dans « réservation immédiate » que dans « sur devis ».
    query = query.in("booking_mode", [filters.bookingMode, "both"]);
  }

  if (filters.category) {
    // Une famille (« lieux », « ambiance ») doit remonter toutes ses
    // sous-catégories, une sous-catégorie seulement elle-même.
    query = query.or(`category_slug.eq.${filters.category},family_slug.eq.${filters.category}`);
  }

  if (filters.q) {
    const term = escapeForLike(filters.q);
    query = query.or(`title.ilike.%${term}%,city.ilike.%${term}%,category_name.ilike.%${term}%`);
  }

  if (filters.guests) {
    // Une annonce sans capacité renseignée reste proposée : l'absence
    // d'information ne vaut pas incapacité.
    query = query.or(`max_capacity.gte.${filters.guests},max_capacity.is.null`);
  }

  if (filters.budgetMax) query = query.lte("price_from", filters.budgetMax);

  if (filters.amenities.length > 0) {
    // `contains` = possède *tous* les équipements demandés.
    query = query.contains("amenity_slugs", filters.amenities);
  }

  if (filters.from) {
    const available = await listingIdsAvailableBetween(filters.from, filters.to ?? filters.from);
    if (available.length === 0) {
      return { rows: [], total: 0, page: filters.page, pageCount: 0 };
    }
    query = query.in("id", available);
  }

  // Tri appliqué en ligne : le type du constructeur de requête PostgREST est
  // trop spécifique pour transiter proprement par une fonction intermédiaire.
  switch (filters.sort) {
    case "prix-croissant":
      query = query.order("price_from", { ascending: true, nullsFirst: false });
      break;
    case "prix-decroissant":
      query = query.order("price_from", { ascending: false, nullsFirst: false });
      break;
    case "note":
      query = query.order("rating_avg", { ascending: false, nullsFirst: false });
      break;
    default:
      // À défaut de moteur de pertinence, les mieux notées d'abord, puis les
      // plus récemment publiées : un ordre stable vaut mieux qu'un ordre subi.
      query = query
        .order("rating_avg", { ascending: false, nullsFirst: false })
        .order("published_at", { ascending: false, nullsFirst: false });
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    throw new Error(`Recherche impossible : ${error.message}`);
  }

  const total = count ?? 0;

  return {
    rows: ((data ?? []) as unknown as SearchViewRow[])
      .map(toSummary)
      .filter((row): row is ListingSummary => row !== null),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Annonces dont *toutes* les dates demandées sont ouvertes.
 *
 * Une salle fermée le lundi ne peut pas être louée du samedi au mardi : il ne
 * suffit pas qu'une date de la plage soit libre.
 */
async function listingIdsAvailableBetween(from: string, to: string): Promise<string[]> {
  const supabase = await createClient();
  const nights = countDays(from, to);

  const { data, error } = await supabase
    .from("availabilities")
    .select("listing_id, date")
    .eq("status", "open")
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(`Disponibilités indisponibles : ${error.message}`);

  const openDaysByListing = new Map<string, number>();
  for (const row of data ?? []) {
    openDaysByListing.set(row.listing_id, (openDaysByListing.get(row.listing_id) ?? 0) + 1);
  }

  return [...openDaysByListing.entries()]
    .filter(([, openDays]) => openDays >= nights)
    .map(([listingId]) => listingId);
}

function countDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** `%` et `_` sont des jokers PostgREST : une recherche « 100 % coton » les inclurait. */
function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&").replace(/[,()]/g, " ");
}

// -----------------------------------------------------------------------------
// Fiche annonce
// -----------------------------------------------------------------------------

export async function getListingBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
      id, slug, title, description, highlights, city, district, address,
      latitude, longitude, cover_url, currency, booking_mode, min_notice_days,
      min_price, price_from, payment_terms, rating_avg, rating_count, kind,
      categories(slug, name),
      organizations(slug, brand_name, legal_name, city, phone),
      partner_profiles:organizations(partner_profiles(bio, is_verified, years_experience, response_time_avg_h, rating_avg, rating_count)),
      cancellation_policies(slug, name, summary),
      venue_details(*),
      service_details(*),
      listing_media(storage_path, alt, position, type),
      listing_options(id, label, description, price, unit, max_quantity, is_required),
      pricing_rules(unit, base_price, weekend_multiplier, min_duration),
      listing_amenities(amenities(slug, name, icon))
    `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Annonce illisible : ${error.message}`);

  return data;
}

export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingBySlug>>>;

/** Disponibilités des douze prochains mois, pour le calendrier de la fiche. */
export async function getAvailabilities(listingId: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("availabilities")
    .select("date, status, price, slot")
    .eq("listing_id", listingId)
    .gte("date", today)
    .order("date");

  if (error) throw new Error(`Planning illisible : ${error.message}`);

  return data ?? [];
}

/** Annonces voisines : même catégorie, même ville en priorité. */
export async function getSimilarListings(listing: {
  id: string;
  category_slug?: string | null;
  city: string;
}) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listing_search")
    .select(CARD_COLUMNS)
    .eq("status", "approved")
    .eq("is_paused", false)
    .neq("id", listing.id)
    .eq("city", listing.city)
    .limit(3);

  return ((data ?? []) as unknown as SearchViewRow[])
    .map(toSummary)
    .filter((row): row is ListingSummary => row !== null);
}

// -----------------------------------------------------------------------------
// Référentiels pour les filtres
// -----------------------------------------------------------------------------

export interface CategoryGroup {
  slug: string;
  name: string;
  kind: "venue" | "service";
  children: { slug: string; name: string }[];
}

export async function getFilterOptions() {
  const supabase = await createClient();

  const [cities, categories, amenities] = await Promise.all([
    supabase.from("cities").select("slug, name").eq("is_active", true).order("sort_order"),
    supabase
      .from("categories")
      .select("id, slug, name, kind, parent_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("amenities").select("slug, name, icon, applies_to").order("sort_order"),
  ]);

  // L'arborescence est reconstruite ici, une fois : l'interface reçoit des
  // familles avec leurs enfants et n'a aucun rattachement à faire.
  const rows = categories.data ?? [];
  const groups: CategoryGroup[] = rows
    .filter((c) => c.parent_id === null)
    .map((family) => ({
      slug: family.slug,
      name: family.name,
      kind: family.kind,
      children: rows
        .filter((child) => child.parent_id === family.id)
        .map((child) => ({ slug: child.slug, name: child.name })),
    }));

  return {
    cities: cities.data ?? [],
    categoryGroups: groups,
    amenities: amenities.data ?? [],
  };
}

/** Une famille de métiers, réduite à ce qu'on peut réellement y réserver. */
export interface HomeFamily {
  slug: string;
  name: string;
  kind: "venue" | "service";
  /** Sous-catégories ayant au moins une annonce publiée, les plus fournies d'abord. */
  pourvues: { slug: string; name: string; listings: number }[];
  /** Annonces publiées dans toute la famille. */
  listings: number;
  /** Métiers déclarés dans la famille, pourvus ou non. */
  metiers: number;
}

/**
 * Les deux blocs de l'accueil.
 *
 * L'accueil affichait les 39 catégories en pastilles identiques, **dont 27
 * vides** : un visiteur cliquait « Photographe » et tombait sur une page
 * blanche. On ne met donc en avant que les métiers pourvus — le catalogue
 * complet reste sur `/categories`, où l'on vient chercher, pas découvrir.
 *
 * `bookableNow` s'appuie sur un fait vérifiable — le partenaire accepte la
 * réservation immédiate et a ouvert des dates — et non sur une popularité
 * qu'aucune donnée ne soutient : il n'existe encore ni avis, ni note, ni
 * réservation.
 */
export async function getHomeSections(limit = 6): Promise<{
  families: HomeFamily[];
  bookableNow: ListingSummary[];
}> {
  const supabase = await createClient();

  const [{ data: categories }, { data: counts }, { data: bookable }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, kind, parent_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("category_live_counts").select("category_slug, family_slug, listings"),
    supabase
      .from("listings_bookable_now")
      .select(CARD_COLUMNS)
      .eq("status", "approved")
      .eq("is_paused", false)
      // Le plus de dates ouvertes d'abord : c'est le partenaire chez qui le
      // client a le plus de chances de trouver la sienne.
      .order("dates_ouvertes", { ascending: false })
      .limit(limit),
  ]);

  const rows = categories ?? [];
  const parLieu = new Map((counts ?? []).map((c) => [c.category_slug, Number(c.listings ?? 0)]));

  const families: HomeFamily[] = rows
    .filter((c) => c.parent_id === null)
    .map((family) => {
      const enfants = rows.filter((child) => child.parent_id === family.id);
      const pourvues = enfants
        .map((child) => ({
          slug: child.slug,
          name: child.name,
          listings: parLieu.get(child.slug) ?? 0,
        }))
        .filter((child) => child.listings > 0)
        .sort((a, b) => b.listings - a.listings);

      return {
        slug: family.slug,
        name: family.name,
        kind: family.kind,
        pourvues,
        listings: pourvues.reduce((total, child) => total + child.listings, 0),
        metiers: enfants.length,
      };
    })
    // Une famille sans aucune annonce n'a rien à proposer aujourd'hui : elle
    // reste visible sur /categories, pas sur l'accueil.
    .filter((family) => family.listings > 0)
    .sort((a, b) => b.listings - a.listings);

  // Même conversion que `searchListings` : la liste de colonnes est construite
  // à l'exécution, le typage généré ne peut donc pas la rapprocher de la vue.
  return { families, bookableNow: (bookable ?? []) as unknown as ListingSummary[] };
}
