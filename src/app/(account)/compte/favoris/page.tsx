import Link from "next/link";
import { Heart, Search } from "lucide-react";

import { FavoriteButton } from "@/components/marketplace/FavoriteButton";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getFavorites } from "@/lib/favorites";

/**
 * Les annonces mises de côté.
 *
 * ⚠️ **Aucun compteur social nulle part**, ni ici ni sur les cartes : « 42
 * personnes ont aimé » dépend de qui passe, pas de ce que vaut la prestation
 * (guide §5). La politique RLS rend d'ailleurs l'agrégat illisible.
 *
 * **Une annonce retirée du catalogue ne disparaît pas en silence.** Elle
 * devient invisible pour le client — `listings_select` ne rend que les
 * annonces publiées — donc on ne peut pas dire *laquelle* a disparu, seulement
 * combien. Se taire laisserait croire qu'on a perdu sa sélection.
 */

export const metadata = { title: "Favoris" };

export default async function FavoritesPage() {
  await requireSpace("account");

  const { listings, unavailable } = await getFavorites();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Favoris</h1>
        <p className="mt-1 text-sm text-slate-500">
          {listings.length === 0
            ? "Gardez de côté les annonces qui vous plaisent."
            : `${listings.length} annonce${listings.length > 1 ? "s" : ""} mise${listings.length > 1 ? "s" : ""} de côté.`}
        </p>
      </div>

      {unavailable > 0 ? (
        <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          <strong>
            {unavailable} annonce{unavailable > 1 ? "s" : ""} de votre sélection{" "}
            {unavailable > 1 ? "ne sont plus disponibles" : "n'est plus disponible"}.
          </strong>{" "}
          Son prestataire l&apos;a retirée du catalogue ou mise en pause. Elle reviendra ici
          s&apos;il la remet en ligne.
        </p>
      ) : null}

      {listings.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Aucun favori pour l'instant"
          description="Touchez le cœur sur une annonce pour la retrouver ici, et comparer à tête reposée."
          action={
            <Link href="/recherche">
              <Button>
                <Search className="h-4 w-4" aria-hidden />
                Explorer le catalogue
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <div key={listing.id} className="relative">
              <FavoriteButton listingId={listing.id} initial signedIn />
              <ListingCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
