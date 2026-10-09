import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Avis clients — lecture.
 *
 * L'écriture passe par les Server Actions de chaque espace ; tout ce qui
 * compte y est **dérivé en base** (auteur, organisation, annonce, signature),
 * et l'éligibilité est imposée par un déclencheur, pas ici. Ce module ne fait
 * que lire.
 *
 * ⚠️ **La signature d'un avis ne vient pas de `profiles`.** Cette table n'est
 * lisible que par son propriétaire (`profiles_select_own`, migration 0002), et
 * il n'est pas question de l'ouvrir pour afficher un prénom. `author_label` est
 * calculé à l'écriture et stocké — c'est pourquoi aucune jointure n'apparaît
 * ci-dessous.
 */

export interface ReviewView {
  id: string;
  rating: number;
  body: string | null;
  /** Prénom + initiale, figés à l'écriture. Jamais le nom complet. */
  authorLabel: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
}

/** Les colonnes lisibles. `hidden_reason` et `hidden_by` n'en font pas partie. */
const COLUMNS = "id, rating, body, author_label, reply, replied_at, created_at";

interface Row {
  id: string;
  rating: number;
  body: string | null;
  author_label: string;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

function toView(row: Row): ReviewView {
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    authorLabel: row.author_label,
    createdAt: row.created_at,
    reply: row.reply,
    repliedAt: row.replied_at,
  };
}

/**
 * Avis publiés d'une annonce, les plus récents d'abord.
 *
 * `hidden_at is null` est explicite alors que la RLS le ferait : l'intention
 * reste lisible, et l'index partiel `reviews_listing_idx` est utilisé.
 */
export async function getListingReviews(listingId: string, limit = 20): Promise<ReviewView[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select(COLUMNS)
    .eq("listing_id", listingId)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Row[]).map(toView);
}

export interface PartnerReview extends ReviewView {
  hiddenAt: string | null;
  listingId: string | null;
  listingTitle: string | null;
  orderReference: string;
}

/**
 * Avis reçus par un partenaire, pour `/pro/avis`.
 *
 * Les avis masqués en font partie : le prestataire a besoin de savoir ce qui a
 * été dit de lui, et qu'un signalement a été retenu. Il ne voit pas le motif de
 * modération — il cite souvent celui qui a signalé.
 */
export async function getPartnerReviews(orgId: string): Promise<PartnerReview[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select(`${COLUMNS}, hidden_at, listing_id, listings(title), orders(reference)`)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  type Jointe = Row & {
    hidden_at: string | null;
    listing_id: string | null;
    listings: { title: string } | null;
    orders: { reference: string } | null;
  };

  return ((data ?? []) as unknown as Jointe[]).map((row) => ({
    ...toView(row),
    hiddenAt: row.hidden_at,
    listingId: row.listing_id,
    listingTitle: row.listings?.title ?? null,
    orderReference: row.orders?.reference ?? "",
  }));
}

/** L'avis déjà déposé sur chacune des commandes passées en argument. */
export async function getMyReviewsByOrder(orderIds: string[]): Promise<Map<string, ReviewView>> {
  if (orderIds.length === 0) return new Map();

  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select(`${COLUMNS}, order_id`)
    .in("order_id", orderIds);

  return new Map(
    ((data ?? []) as (Row & { order_id: string })[]).map((row) => [row.order_id, toView(row)]),
  );
}

export interface AdminReview extends ReviewView {
  hiddenAt: string | null;
  hiddenReason: string | null;
  orgId: string;
  orgName: string;
  listingId: string | null;
  listingTitle: string | null;
  orderReference: string;
}

/**
 * Tous les avis, pour `/admin/avis`.
 *
 * Par fonction `SECURITY DEFINER` et non par requête directe : `hidden_reason`
 * est hors du `grant select`, et un administrateur est lui aussi
 * `authenticated` — un droit de colonne ne sait pas l'en distinguer. Même
 * moule qu'`admin_users()` (0040) et `admin_companies()` (0036).
 */
export async function getAdminReviews(
  etat: "tous" | "visibles" | "masques" = "tous",
): Promise<AdminReview[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_reviews", { etat });

  if (error) throw new Error(`Avis illisibles : ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    rating: row.rating,
    body: row.body,
    authorLabel: row.author_label,
    createdAt: row.created_at,
    reply: row.reply,
    repliedAt: row.replied_at,
    hiddenAt: row.hidden_at,
    hiddenReason: row.hidden_reason,
    orgId: row.org_id,
    orgName: row.org_name,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    orderReference: row.order_reference,
  }));
}
