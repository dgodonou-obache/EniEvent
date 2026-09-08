/**
 * Filtres de recherche.
 *
 * L'URL est la source de vérité : une recherche doit pouvoir être copiée,
 * partagée, mise en favori et rechargée à l'identique. Ce module traduit dans
 * les deux sens, et c'est lui qui assainit — une valeur aberrante venue de
 * l'URL ne doit pas atteindre la base.
 *
 * Les noms de paramètres sont en français, comme les routes.
 */

export const SORTS = ["pertinence", "prix-croissant", "prix-decroissant", "note"] as const;
export type Sort = (typeof SORTS)[number];

export const KINDS = ["venue", "service"] as const;
export type Kind = (typeof KINDS)[number];

export const BOOKING_MODES = ["instant", "quote"] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

export const PAGE_SIZE = 12;

export interface SearchFilters {
  q?: string;
  city?: string;
  category?: string;
  kind?: Kind;
  from?: string;
  to?: string;
  guests?: number;
  budgetMax?: number;
  amenities: string[];
  bookingMode?: BookingMode;
  sort: Sort;
  page: number;
}

type ParamInput = URLSearchParams | Record<string, string | string[] | undefined>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function read(params: ParamInput, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;

  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function readAll(params: ParamInput, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);

  const value = params[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanText(raw: string | undefined, maxLength = 120): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function validDate(raw: string | undefined): string | undefined {
  if (!raw || !DATE_KEY.test(raw)) return undefined;
  // `2026-13-45` a la bonne forme sans être une date : on vérifie qu'elle existe.
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const roundTrips =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return roundTrips ? raw : undefined;
}

export function parseFilters(params: ParamInput): SearchFilters {
  const from = validDate(read(params, "du"));
  let to = validDate(read(params, "au"));

  // Une fin antérieure au début est une saisie incohérente : on l'ignore plutôt
  // que de renvoyer zéro résultat sans explication.
  if (from && to && to < from) to = undefined;

  const sortRaw = read(params, "tri");
  const kindRaw = read(params, "type");
  const modeRaw = read(params, "reservation");

  // Les équipements arrivent soit répétés (`?equipements=wifi&equipements=parking`),
  // soit séparés par des virgules : on accepte les deux.
  const amenities = [
    ...new Set(
      readAll(params, "equipements")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  return {
    q: cleanText(read(params, "q")),
    city: cleanText(read(params, "ville"), 80),
    category: cleanText(read(params, "categorie"), 80),
    kind: (KINDS as readonly string[]).includes(kindRaw ?? "") ? (kindRaw as Kind) : undefined,
    from,
    to,
    guests: positiveInt(read(params, "invites")),
    budgetMax: positiveInt(read(params, "budget")),
    amenities,
    bookingMode: (BOOKING_MODES as readonly string[]).includes(modeRaw ?? "")
      ? (modeRaw as BookingMode)
      : undefined,
    sort: (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as Sort) : "pertinence",
    page: positiveInt(read(params, "page")) ?? 1,
  };
}

/**
 * Sérialise en n'écrivant que ce qui s'écarte du défaut : l'URL d'une recherche
 * vierge reste `/recherche`, et non `/recherche?tri=pertinence&page=1`.
 */
export function toSearchParams(filters: Partial<SearchFilters>): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.city) params.set("ville", filters.city);
  if (filters.category) params.set("categorie", filters.category);
  if (filters.kind) params.set("type", filters.kind);
  if (filters.from) params.set("du", filters.from);
  if (filters.to) params.set("au", filters.to);
  if (filters.guests) params.set("invites", String(filters.guests));
  if (filters.budgetMax) params.set("budget", String(filters.budgetMax));
  for (const amenity of filters.amenities ?? []) params.append("equipements", amenity);
  if (filters.bookingMode) params.set("reservation", filters.bookingMode);
  if (filters.sort && filters.sort !== "pertinence") params.set("tri", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function buildSearchUrl(filters: Partial<SearchFilters>, pathname = "/recherche"): string {
  const query = toSearchParams(filters).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Un changement de filtre ramène toujours à la première page. */
export function withFilter<K extends keyof SearchFilters>(
  filters: SearchFilters,
  key: K,
  value: SearchFilters[K],
): SearchFilters {
  return { ...filters, [key]: value, page: 1 };
}

export function toggleAmenity(filters: SearchFilters, slug: string): SearchFilters {
  const active = filters.amenities.includes(slug);
  return withFilter(
    filters,
    "amenities",
    active ? filters.amenities.filter((a) => a !== slug) : [...filters.amenities, slug],
  );
}

export function activeFilterCount(filters: SearchFilters): number {
  return [
    filters.q,
    filters.city,
    filters.category,
    filters.kind,
    filters.from,
    filters.guests,
    filters.budgetMax,
    filters.bookingMode,
  ].filter(Boolean).length + filters.amenities.length;
}

export function clearFilters(): SearchFilters {
  return { amenities: [], sort: "pertinence", page: 1 };
}

export function pageRange(page: number): { from: number; to: number } {
  const start = (page - 1) * PAGE_SIZE;
  return { from: start, to: start + PAGE_SIZE - 1 };
}
