import Link from "next/link";
import { CalendarDays, Pencil, Plus } from "lucide-react";

import { PlanningBoard } from "@/components/dashboard/PlanningBoard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { toKey } from "@/lib/calendar";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/money";
import { getListingAvailabilities, getPartnerListing, getPartnerListings } from "@/lib/partner";
import { PLANNING_SLOT, planningWindow } from "@/lib/planning";
import type { AvailabilityRow } from "@/lib/pricing";

export const metadata = { title: "Planning & tarifs" };

/**
 * Planning du partenaire.
 *
 * L'annonce visée vit dans l'URL (`?annonce=`) et non dans un état local : un
 * partenaire qui recharge sa page, ou la partage avec un collègue, doit
 * retrouver le même planning.
 */
export default async function PartnerPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ annonce?: string }>;
}) {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;
  const [listings, params] = await Promise.all([getPartnerListings(orgId), searchParams]);

  if (listings.length === 0) {
    return (
      <div>
        <Header />
        <EmptyState
          icon={CalendarDays}
          title="Aucune annonce à planifier"
          description="Le planning ouvre les dates d'une annonce à la réservation. Créez d'abord une annonce, puis revenez fixer vos disponibilités et vos tarifs."
          action={
            <Link href="/pro/annonces/nouvelle">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                Créer une annonce
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  // Une annonce demandée qui n'appartient pas à l'organisation est ignorée
  // sans bruit : la requête suivante la refuserait de toute façon.
  const selectedId = listings.some((listing) => listing.id === params.annonce)
    ? (params.annonce as string)
    : listings[0].id;

  const detail = await getPartnerListing(orgId, selectedId);
  if (!detail) return null;

  const window = planningWindow();
  const rows = await getListingAvailabilities(selectedId, window.from, window.to);

  const availabilities: AvailabilityRow[] = rows
    .filter((row) => row.slot === PLANNING_SLOT)
    .map((row) => ({ date: row.date, status: row.status, price: row.price }));

  // Le planning raisonne à la journée : c'est le tarif journalier qui sert de
  // repli. Une annonce facturée à la personne n'en a pas, et le partenaire
  // fixe alors ses tarifs date par date.
  const dayPricing = (detail.pricing_rules ?? []).find((rule) => rule.unit === "day");

  const dayRule = dayPricing
    ? {
        basePrice: dayPricing.base_price,
        weekendMultiplier: Number(dayPricing.weekend_multiplier ?? 1),
      }
    : null;

  return (
    <div>
      <Header listingId={selectedId} />

      <PlanningBoard
        listings={listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          status: listing.status,
          isPaused: listing.is_paused,
        }))}
        listingId={selectedId}
        minPrice={detail.min_price}
        currency={(detail.currency ?? DEFAULT_CURRENCY) as CurrencyCode}
        dayRule={dayRule}
        availabilities={availabilities}
        today={toKey(new Date())}
      />
    </div>
  );
}

function Header({ listingId }: { listingId?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Planning &amp; tarifs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ouvrez les dates auxquelles vous êtes disponible, et ajustez le tarif au jour le jour.
        </p>
      </div>

      {listingId ? (
        <Link href={`/pro/annonces/${listingId}`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier l&apos;annonce
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
