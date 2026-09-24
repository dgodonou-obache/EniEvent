import "server-only";

import type { ListingCardData } from "@/components/marketplace/ListingCard";
import { createClient } from "@/utils/supabase/server";

/**
 * Favoris d'un client.
 *
 * ⚠️ **Strictement privés, et sans compteur public.** « 42 personnes ont mis
 * cette salle en favori » serait de la preuve sociale fabriquée à peu de
 * frais : le chiffre dépend de qui passe, pas de ce que vaut la prestation, et
 * rien n'empêcherait un partenaire de le gonfler. Le guide §5 l'interdit, et
 * la politique `favorites_own` rend l'agrégat impossible à lire — ce qui vaut
 * mieux qu'une règle qu'on se rappelle.
 *
 * Conséquence directe : il n'existe ici **aucune** fonction rendant un nombre
 * de favoris pour une annonce. Ne pas en ajouter.
 */

const CARTE = [
  "id",
  "slug",
  "title",
  "city",
  "district",
  "kind",
  "cover_url",
  "currency",
  "booking_mode",
  "price_from",
  "price_from_unit",
  "category_name",
  "org_name",
  "org_verified",
  "max_capacity",
].join(", ");

/**
 * La ligne rendue par `listing_search`.
 *
 * ⚠️ Le transtypage explicite est la convention du dépôt pour cette vue (voir
 * `SearchViewRow` dans `./listings.ts`) : la liste de colonnes est assemblée à
 * l'exécution, donc TypeScript ne la voit que comme une chaîne, et le typage
 * génératif de PostgREST ne peut pas s'appliquer.
 */
interface CarteRow {
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
  price_from_unit: string | null;
  category_name: string | null;
  org_name: string | null;
  org_verified: boolean | null;
  max_capacity: number | null;
}

export interface FavoriteListing extends ListingCardData {
  id: string;
}

export interface FavoritesView {
  listings: FavoriteListing[];
  /**
   * Favoris dont l'annonce n'est plus visible — dépubliée, mise en pause ou
   * supprimée par son partenaire.
   *
   * ⚠️ **Ce compte ne peut pas être remplacé par un indicateur par ligne.**
   * `listings_select` ne rend au client que les annonces `approved` et non
   * mises en pause : une annonce retirée n'est pas « lisible mais fermée »,
   * elle est **invisible**. On ne peut donc pas afficher laquelle a disparu —
   * seulement combien. Les taire entièrement donnerait l'impression d'avoir
   * perdu sa sélection.
   */
  unavailable: number;
}

export async function getFavorites(): Promise<FavoritesView> {
  const supabase = await createClient();

  // ⚠️ Deux requêtes, et non une jointure : `favorites` porte une clé étrangère
  // vers `listings`, mais les colonnes d'une carte vivent dans la vue
  // `listing_search`. PostgREST ne sait pas traverser une clé étrangère vers
  // une vue.
  const { data: lignes, error } = await supabase
    .from("favorites")
    .select("listing_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Lecture des favoris impossible : ${error.message}`);

  const ids = (lignes ?? []).map((f) => f.listing_id);
  if (ids.length === 0) return { listings: [], unavailable: 0 };

  const { data: annonces } = await supabase.from("listing_search").select(CARTE).in("id", ids);

  // L'ordre de la vue n'est pas celui des favoris : on remet la sélection dans
  // l'ordre où elle a été faite, le plus récent d'abord.
  const parId = new Map(
    ((annonces ?? []) as unknown as CarteRow[]).map((l) => [l.id, l] as const),
  );

  const listings = ids
    .map((id) => parId.get(id))
    .filter((l): l is CarteRow => l !== undefined)
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      city: l.city,
      district: l.district,
      kind: l.kind,
      cover_url: l.cover_url,
      currency: l.currency,
      booking_mode: l.booking_mode,
      price_from: l.price_from,
      price_from_unit: l.price_from_unit,
      org_name: l.org_name,
      org_verified: l.org_verified,
      category_name: l.category_name,
      max_capacity: l.max_capacity,
    }));

  return { listings, unavailable: ids.length - listings.length };
}

/** Les identifiants mis de côté, pour allumer le cœur sur les cartes. */
export async function getFavoriteIds(): Promise<Set<string>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Un visiteur non connecté n'a pas de favoris : on évite une requête qui ne
  // rendrait rien, la RLS filtrant sur `auth.uid()`.
  if (!user) return new Set();

  const { data } = await supabase.from("favorites").select("listing_id");

  return new Set((data ?? []).map((f) => f.listing_id));
}
