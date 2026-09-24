import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { ListingDetail } from "@/components/marketplace/ListingDetail";
import { getAvailabilities, getListingBySlug, getSimilarListings } from "@/lib/listings";
import { getFavoriteIds } from "@/lib/favorites";
import { getUser } from "@/lib/auth/session";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) return { title: "Prestataire introuvable" };

  return {
    title: `${listing.title} — ${listing.city}`,
    description: listing.description?.slice(0, 160) ?? undefined,
  };
}

export default async function ServicePage({ params }: { params: Params }) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  if (listing.kind !== "service") redirect(`/lieux/${listing.slug}`);

  const [availabilities, similar, favoris, user] = await Promise.all([
    getAvailabilities(listing.id),
    getSimilarListings({ id: listing.id, city: listing.city }),
    getFavoriteIds(),
    getUser(),
  ]);

  return (
    <ListingDetail
      listing={listing}
      availabilities={availabilities}
      similar={similar}
      isFavorite={favoris.has(listing.id)}
      signedIn={user !== null}
    />
  );
}
