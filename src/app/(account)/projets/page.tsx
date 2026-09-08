import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getMyRequests } from "@/lib/quotes";
import { REQUEST_STATUS_LABELS, describeDeadline, type QuoteRequestStatus } from "@/lib/states";

export const metadata = { title: "Mes projets" };

export default async function ProjectsPage() {
  await requireUser();
  const requests = await getMyRequests();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes projets</h1>
          <p className="mt-1 text-sm text-slate-500">
            {requests.length === 0
              ? "Vous n'avez pas encore de demande de devis."
              : `${requests.length} demande${requests.length > 1 ? "s" : ""}`}
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
          title="Décrivez votre événement une seule fois"
          description="Vous précisez ce que vous cherchez, les prestataires concernés vous répondent, et vous comparez leurs devis côte à côte. C'est gratuit et sans engagement."
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
            const items = request.quote_request_items ?? [];
            // Seuls les devis envoyés remontent jusqu'ici : la RLS masque les
            // brouillons des prestataires.
            const received = items.reduce((total, item) => total + (item.quotes?.length ?? 0), 0);
            const awarded = items.filter((item) => item.awarded_quote_id).length;
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
                        <StatusBadge status={request.status as QuoteRequestStatus} />
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {request.city}
                        {request.event_date
                          ? ` · ${new Date(request.event_date).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}`
                          : request.is_date_flexible
                            ? " · date souple"
                            : ""}
                        {request.guests ? ` · ${request.guests} invités` : ""}
                      </p>

                      <p className="mt-2 text-sm">
                        <span className="font-bold text-slate-900">
                          {received === 0
                            ? "Aucun devis pour l'instant"
                            : `${received} devis reçu${received > 1 ? "s" : ""}`}
                        </span>
                        <span className="text-slate-500">
                          {" "}
                          sur {items.length} prestation{items.length > 1 ? "s" : ""}
                          {awarded > 0 ? ` · ${awarded} prestataire${awarded > 1 ? "s" : ""} choisi${awarded > 1 ? "s" : ""}` : ""}
                        </span>
                      </p>

                      {request.status === "open" ? (
                        <p
                          className={`mt-1 text-xs font-medium ${
                            deadline.state === "depasse"
                              ? "text-slate-400"
                              : deadline.state === "urgent"
                                ? "text-orange-600"
                                : "text-slate-500"
                          }`}
                        >
                          {deadline.label}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {request.budget_max != null ? (
                        <p className="text-sm font-bold text-slate-900 tabular-nums">
                          ≤ {format(money(request.budget_max, (request.currency ?? "XOF") as CurrencyCode))}
                        </p>
                      ) : null}
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
