import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { ListingEditor } from "@/components/dashboard/ListingEditor";
import { PhotoManager } from "@/components/dashboard/PhotoManager";
import { Button } from "@/components/ui/button";
import { requireSpace } from "@/lib/auth/session";
import { getListingFormOptions, getPartnerListing } from "@/lib/partner";

type Params = Promise<{ id: string }>;

export const metadata = { title: "Modifier une annonce" };

export default async function EditListingPage({ params }: { params: Params }) {
  const { id } = await params;
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const [listing, options] = await Promise.all([
    getPartnerListing(decision.org.orgId, id),
    getListingFormOptions(),
  ]);

  // `notFound` plutôt qu'un message : une annonce d'un autre partenaire ne doit
  // pas se distinguer d'une annonce inexistante, sinon l'existence même des
  // annonces concurrentes devient devinable.
  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/pro/annonces"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-orange-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Mes annonces
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">
            {listing.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {listing.categories?.name} · {listing.city}
          </p>
        </div>

        <Link href={`/pro/planning?annonce=${listing.id}`}>
          <Button variant="outline" size="sm">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Planning et tarifs
          </Button>
        </Link>
      </div>

      {/* Les photos passent avant le reste du formulaire : c'est ce qu'un
          client regarde en premier, et ce qui manquait le plus aux annonces. */}
      <div className="space-y-6">
        <PhotoManager
          listingId={listing.id}
          orgId={decision.org.orgId}
          photos={[...(listing.listing_media ?? [])].sort((a, b) => a.position - b.position)}
          coverUrl={listing.cover_url}
        />

        <ListingEditor
          listing={listing}
          categoryGroups={options.categoryGroups}
          cities={options.cities}
          policies={options.policies}
        />
      </div>
    </div>
  );
}
