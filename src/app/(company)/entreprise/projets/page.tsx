import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getCompanyRequests } from "@/lib/company";
import { format, money, type CurrencyCode } from "@/lib/money";
import { REQUEST_STATUS_LABELS, describeDeadline, type QuoteRequestStatus } from "@/lib/states";

export const metadata = { title: "Projets" };

/**
 * Les demandes de toute l'entreprise, pas seulement les siennes.
 *
 * C'est la différence avec `/projets` côté particulier : un collègue qui
 * reprend un dossier — congés, départ — doit y retrouver l'historique complet,
 * l'auteur et le centre de coût.
 */
export default async function CompanyProjectsPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const requests = await getCompanyRequests(decision.org.orgId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projets</h1>
          <p className="mt-1 text-sm text-slate-500">
            {requests.length === 0
              ? "Aucune demande pour l'instant."
              : `${requests.length} demande${requests.length > 1 ? "s" : ""} de l'entreprise`}
          </p>
        </div>

        <Link href="/demande-de-devis">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvelle demande
          </Button>
        </Link>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Lancez votre premier appel d'offres"
          description="Décrivez l'événement une fois, rattachez-le à un centre de coût, et recevez des devis comparables de plusieurs prestataires."
          action={
            <Link href="/demande-de-devis">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                Demander des devis
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const status = request.status as QuoteRequestStatus;
            const currency = (request.currency ?? "XOF") as CurrencyCode;
            const items = request.quote_request_items ?? [];
            const received = items.reduce((total, item) => total + (item.quotes?.length ?? 0), 0);
            const awarded = items.filter((item) => item.awarded_quote_id);

            // Engagé sur ce projet : la somme des offres retenues.
            const committed = items.reduce((total, item) => {
              const chosen = (item.quotes ?? []).find((q) => q.id === item.awarded_quote_id);
              return total + (chosen?.subtotal ?? 0);
            }, 0);

            const deadline = describeDeadline(request.respond_by);

            return (
              <li key={request.id}>
                <Link
                  href={`/projets/${request.id}`}
                  className="block rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-bold text-slate-900">{request.title}</h2>
                        <StatusBadge status={status} />
                        {request.cost_centers ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            {request.cost_centers.code}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {request.reference} · {request.city}
                        {request.event_date
                          ? ` · ${new Date(request.event_date).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}`
                          : ""}
                        {request.requester?.full_name ? ` · ${request.requester.full_name}` : ""}
                      </p>

                      <p className="mt-2 text-sm">
                        <span className="font-bold text-slate-900">
                          {received === 0
                            ? "Aucun devis reçu"
                            : `${received} devis reçu${received > 1 ? "s" : ""}`}
                        </span>
                        <span className="text-slate-500">
                          {" "}
                          sur {items.length} prestation{items.length > 1 ? "s" : ""}
                          {awarded.length > 0
                            ? ` · ${awarded.length} retenue${awarded.length > 1 ? "s" : ""}`
                            : ""}
                        </span>
                      </p>

                      {status === "open" ? (
                        <p
                          className={`mt-1 text-xs font-medium ${
                            deadline.state === "urgent" ? "text-orange-600" : "text-slate-500"
                          }`}
                        >
                          {deadline.label}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        {committed > 0 ? (
                          <p className="font-bold text-slate-900 tabular-nums">
                            {format(money(committed, currency))}
                          </p>
                        ) : null}
                        {request.budget_max != null ? (
                          <p className="text-xs text-slate-400 tabular-nums">
                            budget {format(money(request.budget_max, currency))}
                          </p>
                        ) : null}
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const BADGE_TONES: Record<QuoteRequestStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_approval: "bg-amber-50 text-amber-800",
  open: "bg-orange-50 text-orange-600",
  closed: "bg-amber-50 text-amber-800",
  awarded: "bg-teal-50 text-teal-700",
  cancelled: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
};

function StatusBadge({ status }: { status: QuoteRequestStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE_TONES[status]}`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
