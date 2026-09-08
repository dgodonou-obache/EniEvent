import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";
import type { ListingDetail as Listing, ListingSummary } from "@/lib/listings";
import type { AvailabilityRow } from "@/lib/pricing";

import { BookingBox } from "./BookingBox";
import { ListingCard } from "./ListingCard";

interface ListingDetailProps {
  listing: Listing;
  availabilities: AvailabilityRow[];
  similar: ListingSummary[];
}

export function ListingDetail({ listing, availabilities, similar }: ListingDetailProps) {
  const currency = (listing.currency ?? DEFAULT_CURRENCY) as CurrencyCode;
  const venue = listing.venue_details;
  const service = listing.service_details;
  const org = listing.organizations;
  const policy = listing.cancellation_policies;

  const dayRule = listing.pricing_rules?.find((r) => r.unit === "day") ?? null;
  const mainRule = dayRule ?? listing.pricing_rules?.[0] ?? null;

  const amenities = (listing.listing_amenities ?? [])
    .map((row) => row.amenities)
    .filter((a): a is NonNullable<typeof a> => a != null);

  const media = [...(listing.listing_media ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-slate-500">
        <Link href="/recherche" className="hover:text-orange-600">
          Recherche
        </Link>
        {listing.categories ? (
          <>
            <span className="mx-2">›</span>
            <Link
              href={`/categories/${listing.categories.slug}`}
              className="hover:text-orange-600"
            >
              {listing.categories.name}
            </Link>
          </>
        ) : null}
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {listing.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden />
            {listing.district ? `${listing.district}, ${listing.city}` : listing.city}
          </span>
          {listing.rating_avg != null && (listing.rating_count ?? 0) > 0 ? (
            <span>
              ★ {Number(listing.rating_avg).toFixed(1)} ({listing.rating_count} avis)
            </span>
          ) : (
            <span className="text-sm">Pas encore d&apos;avis</span>
          )}
        </p>
      </header>

      {/* Galerie */}
      <div className="mb-8 overflow-hidden rounded-2xl bg-slate-100">
        {listing.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.cover_url}
            alt={listing.title}
            className="aspect-[16/9] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center text-slate-400">
            Photos à venir
          </div>
        )}
        {media.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto p-2">
            {media.map((item) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.storage_path}
                src={item.storage_path}
                alt={item.alt ?? ""}
                className="h-20 w-28 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          {listing.description ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">À propos</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">
                {listing.description}
              </p>
            </section>
          ) : null}

          {venue ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Capacités</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Stat label="Assis" value={venue.capacity_seated} unit="personnes" />
                <Stat label="Debout" value={venue.capacity_standing} unit="personnes" />
                <Stat label="Cocktail" value={venue.capacity_cocktail} unit="personnes" />
                <Stat label="Surface" value={venue.surface_m2} unit="m²" />
                <Stat label="Parking" value={venue.parking_spots} unit="places" />
              </dl>

              {venue.noise_curfew_hour != null ? (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  La musique doit s&apos;arrêter à {venue.noise_curfew_hour}h.
                </p>
              ) : null}
            </section>
          ) : null}

          {service ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Prestation</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Stat label="À partir de" value={service.min_guests} unit="invités" />
                <Stat label="Jusqu'à" value={service.max_guests} unit="invités" />
                <Stat label="Se déplace dans un rayon de" value={service.travel_radius_km} unit="km" />
              </dl>
            </section>
          ) : null}

          {amenities.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Équipements</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {amenities.map((amenity) => (
                  <li key={amenity.slug} className="flex items-center gap-2 text-slate-600">
                    <Check className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                    {amenity.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {listing.listing_options && listing.listing_options.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Options</h2>
              <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                {listing.listing_options.map((option) => (
                  <li key={option.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{option.label}</p>
                      {option.description ? (
                        <p className="text-sm text-slate-500">{option.description}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-bold text-slate-900">
                      {format(money(option.price, currency))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Conditions — formulées en clair, jamais en jargon. */}
          <section>
            <h2 className="text-lg font-bold text-slate-900">Conditions</h2>
            <div className="mt-3 space-y-3">
              {listing.payment_terms ? (
                <div className="flex gap-3 rounded-2xl border border-slate-100 p-4">
                  <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />
                  <div>
                    <p className="font-medium text-slate-900">Paiement</p>
                    <p className="mt-1 text-sm text-slate-600">{listing.payment_terms}</p>
                  </div>
                </div>
              ) : null}

              {policy ? (
                <div className="flex gap-3 rounded-2xl border border-slate-100 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden />
                  <div>
                    <p className="font-medium text-slate-900">Annulation</p>
                    <p className="mt-1 text-sm text-slate-600">{policy.summary}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {org ? (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Le prestataire</h2>
              <div className="mt-3 flex items-start gap-4 rounded-2xl border border-slate-100 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                  <Building2 className="h-6 w-6 text-orange-500" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900">
                    {org.brand_name ?? org.legal_name}
                    <BadgeCheck className="h-4 w-4 text-teal-600" aria-hidden />
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{org.city}</p>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingBox
            slug={listing.slug}
            title={listing.title}
            bookingMode={listing.booking_mode}
            currency={currency}
            priceFrom={listing.price_from}
            availabilities={availabilities}
            dayRule={
              dayRule
                ? {
                    basePrice: dayRule.base_price,
                    weekendMultiplier: Number(dayRule.weekend_multiplier),
                  }
                : null
            }
            priceUnit={mainRule?.unit ?? null}
          />
        </aside>
      </div>

      {similar.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-xl font-bold text-slate-900">
            Autres annonces à {listing.city}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {similar.map((item) => (
              <ListingCard key={item.slug} listing={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  if (value == null) return null;

  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <dt className="micro-label text-slate-400">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1 font-bold text-slate-900">
        <Users className="h-4 w-4 text-slate-300" aria-hidden />
        {value}
        <span className="text-xs font-medium text-slate-500">{unit}</span>
      </dd>
    </div>
  );
}
