import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users, Wallet } from "lucide-react";

import { QuoteComparator } from "@/components/account/QuoteComparator";
import { requireUser } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getRequestDetail } from "@/lib/quotes";
import {
  REQUEST_STATUS_LABELS,
  acceptsNewQuotes,
  describeDeadline,
  type QuoteRequestStatus,
} from "@/lib/states";

export const metadata = { title: "Mon projet" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await params;
  const request = await getRequestDetail(id);

  // La RLS ne renvoie rien sur une demande qui n'est pas la sienne : un 404 est
  // la bonne réponse, et il ne révèle pas l'existence de la demande.
  if (!request) notFound();

  const status = request.status as QuoteRequestStatus;
  const currency = (request.currency ?? "XOF") as CurrencyCode;
  const items = request.quote_request_items ?? [];
  const deadline = describeDeadline(request.respond_by);
  const stillOpen = acceptsNewQuotes(status, request.respond_by);

  const received = items.reduce((total, item) => total + (item.quotes?.length ?? 0), 0);

  return (
    <div>
      <Link
        href="/projets"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Mes projets
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{request.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Référence {request.reference} · {REQUEST_STATUS_LABELS[status]}
            </p>
          </div>

          {status === "open" ? (
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
          ) : null}
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={MapPin} label="Lieu">
            {request.city}
            {request.district ? `, ${request.district}` : ""}
          </Fact>
          <Fact icon={CalendarDays} label="Date">
            {request.event_date
              ? new Date(request.event_date).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : request.is_date_flexible
                ? "Souple"
                : "Non précisée"}
          </Fact>
          <Fact icon={Users} label="Invités">
            {request.guests ?? "Non précisé"}
          </Fact>
          <Fact icon={Wallet} label="Budget maximum">
            {request.budget_max != null
              ? format(money(request.budget_max, currency))
              : "Non précisé"}
          </Fact>
        </dl>

        {request.description ? (
          <p className="mt-5 whitespace-pre-line border-t border-slate-100 pt-5 text-sm text-slate-600">
            {request.description}
          </p>
        ) : null}
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">
          {received === 0
            ? "En attente des premières offres"
            : `${received} offre${received > 1 ? "s" : ""} reçue${received > 1 ? "s" : ""}`}
        </h2>
        <p className="text-sm text-slate-500">
          {stillOpen
            ? "D'autres prestataires peuvent encore répondre."
            : "Cette demande ne reçoit plus de nouvelles offres."}
        </p>
      </div>

      <QuoteComparator
        requestId={request.id}
        items={items}
        currency={currency}
        isDecidable={status === "open" || status === "closed"}
      />
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}
