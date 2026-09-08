import Link from "next/link";
import { CalendarDays, ClipboardList, MapPin, Users, Wallet } from "lucide-react";

import { RespondButton } from "@/components/dashboard/RespondButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getPartnerOpportunities } from "@/lib/quotes";
import { QUOTE_STATUS_LABELS_PARTNER, describeDeadline, type QuoteStatus } from "@/lib/states";

export const metadata = { title: "Demandes reçues" };

/**
 * Les appels d'offres qu'un partenaire peut servir.
 *
 * Aucun filtre de catégorie ni de ville n'est appliqué ici : c'est la RLS,
 * via `app.partner_can_see_item`, qui décide de ce que le partenaire voit.
 * Refaire ce tri côté application le ferait diverger tôt ou tard.
 */
export default async function PartnerRequestsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const opportunities = await getPartnerOpportunities(decision.org.orgId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Demandes reçues</h1>
        <p className="mt-1 text-sm text-slate-500">
          Des clients cherchent une prestation comme la vôtre. Répondez avant la date limite :
          les premiers devis sont ceux qu&apos;on compare le plus attentivement.
        </p>
      </div>

      {opportunities.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune demande pour l'instant"
          description="Vous recevrez ici les appels d'offres correspondant à vos annonces publiées. Plus vos annonces couvrent de catégories et de villes, plus vous en recevrez."
          action={
            <Link href="/pro/annonces">
              <Button variant="outline">Voir mes annonces</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {opportunities.map((item) => {
            const request = item.quote_requests;
            if (!request) return null;

            const currency = (request.currency ?? "XOF") as CurrencyCode;
            const deadline = describeDeadline(request.respond_by);
            const mine = item.myQuote;

            return (
              <li
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:border-orange-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-bold text-slate-900">{request.title}</h2>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {item.categories?.name}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      Référence {request.reference}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      deadline.state === "urgent"
                        ? "bg-orange-100 text-orange-700"
                        : deadline.state === "depasse"
                          ? "bg-slate-100 text-slate-500"
                          : "bg-teal-50 text-teal-700"
                    }`}
                  >
                    {deadline.label}
                  </span>
                </div>

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
                  {/* Le budget de la prestation prime : c'est la part qui
                      revient au partenaire. À défaut, l'enveloppe globale est
                      affichée comme telle, pour qu'il ne la prenne pas pour la
                      sienne. */}
                  {item.budget_max != null ? (
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
                  <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-slate-600">
                    {request.description}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  {mine ? (
                    <>
                      <Link href={`/pro/devis/${mine.id}`}>
                        <Button variant="outline" size="sm">
                          {mine.status === "draft"
                            ? "Reprendre mon brouillon"
                            : "Voir mon devis"}
                        </Button>
                      </Link>
                      <p className="text-sm text-slate-500">
                        {QUOTE_STATUS_LABELS_PARTNER[mine.status as QuoteStatus]}
                        {mine.subtotal > 0
                          ? ` · ${format(money(mine.subtotal, currency))}`
                          : ""}
                      </p>
                    </>
                  ) : deadline.state === "depasse" ? (
                    <p className="text-sm text-slate-400">
                      Le délai de réponse est passé : ce client ne vous attend plus.
                    </p>
                  ) : (
                    <RespondButton itemId={item.id} label="Répondre" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
    <div className="flex items-center gap-1.5 text-slate-600">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      {children}
    </div>
  );
}
