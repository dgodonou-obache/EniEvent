import Link from "next/link";
import { BadgeCheck, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";
import { UNIT_CATALOGUE_LABELS, type PriceUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

export interface ListingCardData {
  slug: string;
  title: string;
  city: string;
  district?: string | null;
  kind: "venue" | "service" | null;
  cover_url?: string | null;
  currency?: string | null;
  booking_mode?: string | null;
  price_from?: number | null;
  /** Sans elle, « à partir de 3 500 FCFA » pour un tarif au m² est un mensonge. */
  price_from_unit?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  category_name?: string | null;
  org_name?: string | null;
  org_verified?: boolean | null;
  max_capacity?: number | null;
}

export function listingHref(listing: Pick<ListingCardData, "kind" | "slug">): string {
  return listing.kind === "venue" ? `/lieux/${listing.slug}` : `/prestataires/${listing.slug}`;
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const currency = (listing.currency ?? DEFAULT_CURRENCY) as CurrencyCode;

  return (
    <Link
      href={listingHref(listing)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 active:scale-[0.99]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {listing.cover_url ? (
          // Image distante non maîtrisée : `img` évite d'avoir à déclarer chaque
          // domaine dans next.config, le temps que les médias soient hébergés
          // sur Supabase Storage.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.cover_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Photo à venir
          </div>
        )}

        {listing.booking_mode === "instant" || listing.booking_mode === "both" ? (
          <Badge className="absolute left-3 top-3">Réservation immédiate</Badge>
        ) : (
          <Badge variant="secondary" className="absolute left-3 top-3">
            Sur devis
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="micro-label text-slate-400">{listing.category_name}</p>

        <h3 className="mt-1 line-clamp-2 font-bold text-slate-900 transition-colors group-hover:text-orange-600">
          {listing.title}
        </h3>

        <p className="mt-1.5 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {listing.district ? `${listing.district}, ${listing.city}` : listing.city}
          </span>
        </p>

        {listing.max_capacity ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Jusqu&apos;à {listing.max_capacity} personnes
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div className="min-w-0">
            {listing.price_from != null ? (
              <p className="truncate text-sm">
                <span className="text-slate-500">à partir de </span>
                <span className="font-bold text-slate-900">
                  {format(money(listing.price_from, currency))}
                </span>
                {listing.price_from_unit ? (
                  <span className="text-slate-500">
                    {" "}
                    {UNIT_CATALOGUE_LABELS[listing.price_from_unit as PriceUnit] ?? ""}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Prix sur devis</p>
            )}

            {listing.org_name ? (
              <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-400">
                {listing.org_verified ? (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
                ) : null}
                <span className="truncate">{listing.org_name}</span>
              </p>
            ) : null}
          </div>

          {listing.rating_avg != null && (listing.rating_count ?? 0) > 0 ? (
            <span
              className={cn(
                "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700",
              )}
            >
              ★ {Number(listing.rating_avg).toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
