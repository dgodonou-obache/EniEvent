import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users, Wallet } from "lucide-react";

import { QuoteComposer } from "@/components/dashboard/QuoteComposer";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getPartnerListingChoices, getQuoteForEdit } from "@/lib/quotes";
import { describeDeadline } from "@/lib/states";
import type { QuoteStatus } from "@/lib/states";

export const metadata = { title: "Rédiger un devis" };

export default async function QuoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const { id } = await params;
  const orgId = decision.org.orgId;

  const [quote, listings] = await Promise.all([
    getQuoteForEdit(orgId, id),
    getPartnerListingChoices(orgId),
  ]);

  if (!quote) notFound();

  const item = quote.quote_request_items;
  const request = item?.quote_requests;
  const currency = (quote.currency ?? "XOF") as CurrencyCode;
  const deadline = describeDeadline(request?.respond_by ?? null);

  return (
    <div>
      <Link
        href="/pro/demandes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Demandes reçues
      </Link>

      {/* Le brief reste sous les yeux : rédiger un devis sans relire la demande
          est la première cause de devis hors sujet. */}
      <section className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="micro-label text-orange-600">La demande du client</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              {request?.title ?? "Demande retirée"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {item?.categories?.name} · {quote.reference}
            </p>
          </div>

          {request?.status === "open" ? (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                deadline.state === "urgent"
                  ? "bg-orange-100 text-orange-700"
                  : deadline.state === "depasse"
                    ? "bg-slate-100 text-slate-500"
                    : "bg-white text-teal-700"
              }`}
            >
              {deadline.label}
            </span>
          ) : null}
        </div>

        {request ? (
          <>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Fact icon={MapPin}>
                {request.city}
                {request.district ? `, ${request.district}` : ""}
              </Fact>
              <Fact icon={CalendarDays}>
                {request.event_date
                  ? new Date(request.event_date).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : request.is_date_flexible
                    ? "Date souple"
                    : "Date non précisée"}
              </Fact>
              {request.guests ? <Fact icon={Users}>{request.guests} invités</Fact> : null}
              {item?.budget_max != null ? (
                <Fact icon={Wallet}>
                  Budget pour cette prestation ≤ {format(money(item.budget_max, currency))}
                </Fact>
              ) : request.budget_max != null ? (
                <Fact icon={Wallet}>
                  Budget global de l&apos;événement ≤{" "}
                  {format(money(request.budget_max, currency))}
                </Fact>
              ) : null}
            </dl>

            {request.description ? (
              <p className="mt-4 whitespace-pre-line border-t border-orange-100 pt-4 text-sm text-slate-700">
                {request.description}
              </p>
            ) : null}

            {item?.notes ? (
              <p className="mt-3 text-sm text-slate-600">
                <span className="font-bold">Précision sur cette prestation : </span>
                {item.notes}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="mt-6">
        <QuoteComposer
          quoteId={quote.id}
          status={quote.status as QuoteStatus}
          subtotal={quote.subtotal}
          currency={currency}
          message={quote.message}
          validUntil={quote.valid_until}
          listingId={quote.listing_id}
          declineReason={quote.decline_reason}
          lines={quote.quote_lines ?? []}
          listings={listings.map((listing) => ({ id: listing.id, title: listing.title }))}
          budgetMax={item?.budget_max ?? request?.budget_max ?? null}
        />
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-slate-700">
      <Icon className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
      {children}
    </div>
  );
}
