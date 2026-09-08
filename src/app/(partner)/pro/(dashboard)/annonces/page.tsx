import Link from "next/link";
import { Building2, Eye, Pencil, Plus } from "lucide-react";

import { ListingStatusBadge } from "@/components/dashboard/ListingStatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money } from "@/lib/money";
import { getPartnerListings } from "@/lib/partner";

export const metadata = { title: "Mes annonces" };

export default async function PartnerListingsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const listings = await getPartnerListings(decision.org.orgId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes annonces</h1>
          <p className="mt-1 text-sm text-slate-500">
            {listings.length === 0
              ? "Vous n'avez pas encore d'annonce."
              : `${listings.length} annonce${listings.length > 1 ? "s" : ""}`}
          </p>
        </div>

        <Link href="/pro/annonces/nouvelle">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvelle annonce
          </Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Créez votre première annonce"
          description="Décrivez ce que vous proposez — une salle, un service traiteur, du matériel — puis ouvrez vos dates. Nos équipes vérifient l'annonce sous 48 h ouvrées avant sa mise en ligne."
          action={
            <Link href="/pro/annonces/nouvelle">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                Créer une annonce
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 sm:flex-row sm:items-center"
            >
              <div className="h-20 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-28">
                {listing.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                    Sans photo
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-bold text-slate-900">{listing.title}</h2>
                  <ListingStatusBadge status={listing.status} isPaused={listing.is_paused} />
                </div>

                <p className="mt-1 truncate text-sm text-slate-500">
                  {listing.categories?.name} · {listing.city}
                  {listing.price_from != null
                    ? ` · à partir de ${format(money(listing.price_from))}`
                    : " · aucun tarif"}
                </p>

                {listing.status === "rejected" && listing.moderation_notes ? (
                  <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span className="font-bold">Motif du refus :</span>{" "}
                    {listing.moderation_notes}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                {listing.status === "approved" ? (
                  <Link
                    href={`/${listing.kind === "venue" ? "lieux" : "prestataires"}/${listing.slug}`}
                    target="_blank"
                  >
                    <Button variant="ghost" size="sm">
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      Voir
                    </Button>
                  </Link>
                ) : null}

                <Link href={`/pro/annonces/${listing.id}`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Modifier
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
