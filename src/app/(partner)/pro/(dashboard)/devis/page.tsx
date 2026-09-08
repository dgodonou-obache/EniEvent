import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getPartnerQuotes } from "@/lib/quotes";
import { QUOTE_STATUS_LABELS_PARTNER, type QuoteStatus } from "@/lib/states";

export const metadata = { title: "Mes devis" };

export default async function PartnerQuotesPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const quotes = await getPartnerQuotes(decision.org.orgId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes devis</h1>
        <p className="mt-1 text-sm text-slate-500">
          {quotes.length === 0
            ? "Vous n'avez pas encore rédigé de devis."
            : `${quotes.length} devis`}
        </p>
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun devis pour l'instant"
          description="Les demandes correspondant à vos annonces arrivent dans « Demandes reçues ». C'est de là que vous rédigez vos propositions."
          action={
            <Link href="/pro/demandes">
              <Button>Voir les demandes</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {quotes.map((quote) => {
            const item = quote.quote_request_items;
            const request = item?.quote_requests;
            const currency = (quote.currency ?? "XOF") as CurrencyCode;
            const status = quote.status as QuoteStatus;

            return (
              <li key={quote.id}>
                <Link
                  href={`/pro/devis/${quote.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-slate-900">
                        {request?.title ?? "Demande retirée"}
                      </p>
                      <QuoteBadge status={status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {item?.categories?.name} · {request?.city}
                      {" · "}
                      {quote.reference}
                    </p>

                    {status === "declined" && quote.decline_reason ? (
                      <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-bold">Retour du client : </span>
                        {quote.decline_reason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-bold text-slate-900 tabular-nums">
                      {quote.subtotal > 0 ? format(money(quote.subtotal, currency)) : "—"}
                    </p>
                    <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden />
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

const TONES: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-orange-50 text-orange-600",
  accepted: "bg-teal-50 text-teal-700",
  declined: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
};

function QuoteBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONES[status]}`}
    >
      {QUOTE_STATUS_LABELS_PARTNER[status]}
    </span>
  );
}
