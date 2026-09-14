import Link from "next/link";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getCompanyRequests } from "@/lib/company";
import { format, money, type CurrencyCode } from "@/lib/money";
import { QUOTE_STATUS_LABELS_CLIENT, type QuoteStatus } from "@/lib/states";

export const metadata = { title: "Devis" };

/**
 * Toutes les offres reçues par l'entreprise, à plat.
 *
 * `/entreprise/projets` regarde par projet ; ici on regarde par offre, pour
 * répondre à une autre question : combien nous a-t-on proposé, et qu'avons-nous
 * retenu.
 */
export default async function CompanyQuotesPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const requests = await getCompanyRequests(decision.org.orgId);

  const quotes = requests.flatMap((request) =>
    (request.quote_request_items ?? []).flatMap((item) =>
      (item.quotes ?? []).map((quote) => ({
        ...quote,
        category: item.categories?.name ?? "Prestation",
        awarded: item.awarded_quote_id === quote.id,
        requestId: request.id,
        requestTitle: request.title,
        reference: request.reference,
        currency: (request.currency ?? "XOF") as CurrencyCode,
      })),
    ),
  );

  const accepted = quotes.filter((quote) => quote.status === "accepted");
  const committed = accepted.reduce((total, quote) => total + quote.subtotal, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Devis</h1>
        <p className="mt-1 text-sm text-slate-500">
          {quotes.length === 0
            ? "Aucune offre reçue pour l'instant."
            : `${quotes.length} offre${quotes.length > 1 ? "s" : ""} reçue${quotes.length > 1 ? "s" : ""} · ${accepted.length} retenue${accepted.length > 1 ? "s" : ""}`}
          {committed > 0
            ? ` · ${format(money(committed, (quotes[0]?.currency ?? "XOF") as CurrencyCode))} engagés`
            : ""}
        </p>
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune offre reçue"
          description="Les devis envoyés par les prestataires en réponse à vos appels d'offres apparaîtront ici, projet par projet."
        />
      ) : (
        <ul className="space-y-3">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/projets/${quote.requestId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold text-slate-900">{quote.requestTitle}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        quote.awarded
                          ? "bg-teal-50 text-teal-700"
                          : quote.status === "declined"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-orange-50 text-orange-600"
                      }`}
                    >
                      {QUOTE_STATUS_LABELS_CLIENT[quote.status as QuoteStatus]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {quote.category} · {quote.reference}
                  </p>
                </div>

                <p className="shrink-0 font-bold text-slate-900 tabular-nums">
                  {format(money(quote.subtotal, quote.currency))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
