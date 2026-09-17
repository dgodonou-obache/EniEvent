import Link from "next/link";
import { AlertTriangle, ClipboardList, Inbox } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { getAllRequests, getRequestCounts, type RequestStatus } from "@/lib/admin";
import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";
import { REQUEST_STATUS_LABELS } from "@/lib/states";
import { cn } from "@/lib/utils";

export const metadata = { title: "Demandes" };

/**
 * Les appels d'offres de toute la plateforme.
 *
 * **L'administration ne décide rien ici.** Les devis des partenaires restent
 * scellés jusqu'à leur envoi au client — les afficher trahirait le principe du
 * pli cacheté, qui est ce qui fait tenir le tunnel. L'écran sert à repérer ce
 * qui se grippe : une demande que personne ne veut, une échéance passée sans
 * que rien ne se produise.
 *
 * On ne montre donc que le **nombre** d'offres reçues, jamais leur contenu.
 */

const ONGLETS: { cle: string; label: string; status?: RequestStatus }[] = [
  { cle: "tous", label: "Toutes" },
  { cle: "open", label: "En cours", status: "open" },
  { cle: "awarded", label: "Attribuées", status: "awarded" },
  { cle: "draft", label: "Brouillons", status: "draft" },
];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const { etat } = await searchParams;
  const onglet = ONGLETS.find((o) => o.cle === etat) ?? ONGLETS[0];

  const [requests, counts] = await Promise.all([
    getAllRequests(onglet.status),
    getRequestCounts(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Demandes</h1>
      <p className="mt-1 text-sm text-slate-500">
        Les appels d&apos;offres déposés par les clients. Les devis des partenaires restent
        scellés — vous voyez combien ont répondu, jamais ce qu&apos;ils proposent.
      </p>

      {counts.enRetard > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-amber-900">
              {counts.enRetard} demande{counts.enRetard > 1 ? "s" : ""} au-delà de leur échéance
            </p>
            <p className="mt-0.5 text-sm text-amber-800/90">
              La date limite de réponse est passée et la demande est toujours ouverte. Le
              client attend une décision que rien ne déclenchera.
            </p>
          </div>
        </div>
      ) : null}

      <nav className="mt-6 flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={o.cle === "tous" ? "/admin/demandes" : `/admin/demandes?etat=${o.cle}`}
            aria-current={o.cle === onglet.cle ? "page" : undefined}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
              o.cle === onglet.cle
                ? "bg-orange-50 text-orange-600"
                : "text-slate-600 hover:bg-orange-50 hover:text-orange-600",
            )}
          >
            {o.label}
            {o.cle === "open" ? <Compteur n={counts.open} /> : null}
            {o.cle === "awarded" ? <Compteur n={counts.awarded} /> : null}
            {o.cle === "tous" ? <Compteur n={counts.total} /> : null}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aucune demande dans cet état"
            description="Les appels d'offres déposés par les clients apparaissent ici dès leur publication, le plus récent en tête."
          />
        ) : (
          <ul className="space-y-3">
            {requests.map((demande) => (
              <Demande key={demande.id} demande={demande} maintenant={counts.maintenant} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Compteur({ n }: { n: number }) {
  return <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{n}</span>;
}

type Demande = Awaited<ReturnType<typeof getAllRequests>>[number];

function Demande({ demande, maintenant }: { demande: Demande; maintenant: number }) {
  const currency = (demande.currency ?? DEFAULT_CURRENCY) as CurrencyCode;
  // Un devis se rattache à une prestation, pas à la demande : on additionne les
  // compteurs de chaque item pour obtenir le nombre d'offres reçues.
  const items = demande.quote_request_items ?? [];
  const offres = items.reduce((total, item) => total + (item.quotes?.[0]?.count ?? 0), 0);
  const metiers = items
    .map((item) => item.categories?.name)
    .filter((name): name is string => Boolean(name));

  const client =
    demande.organizations?.brand_name ??
    demande.organizations?.legal_name ??
    demande.profiles?.full_name ??
    "Particulier";

  const echeance = demande.respond_by ? new Date(demande.respond_by) : null;
  const depassee = echeance != null && demande.status === "open" && echeance.getTime() < maintenant;

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="micro-label text-slate-400">{demande.reference}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {/* L'état se dit en clair : « En cours », pas « open ». */}
              {REQUEST_STATUS_LABELS[demande.status]}
            </span>
          </div>

          <p className="mt-1 truncate font-bold text-slate-900">{demande.title}</p>

          <p className="mt-1 text-sm text-slate-500">
            {client} · {demande.city}
            {demande.guests ? ` · ${demande.guests} invités` : ""}
            {demande.event_date
              ? ` · ${new Date(demande.event_date).toLocaleDateString("fr-FR")}`
              : ""}
          </p>

          {metiers.length > 0 ? (
            <p className="mt-1 text-sm text-slate-400">{metiers.join(" · ")}</p>
          ) : null}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          {demande.budget_max ? (
            <p className="font-bold text-slate-900">
              {format(money(demande.budget_max, currency))}
            </p>
          ) : (
            <p className="text-sm text-slate-400">Budget non précisé</p>
          )}

          {/* Zéro offre sur une demande ouverte est le signal le plus utile de
              cet écran : l'appariement n'a pas trouvé preneur. */}
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-sm sm:justify-end",
              offres === 0 && demande.status === "open" ? "text-amber-600" : "text-slate-500",
            )}
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            {offres === 0 ? "Aucune offre" : `${offres} offre${offres > 1 ? "s" : ""}`}
          </p>

          {echeance ? (
            <p className={cn("mt-1 text-xs", depassee ? "font-medium text-amber-600" : "text-slate-400")}>
              {depassee ? "Échéance dépassée le " : "Réponses jusqu'au "}
              {echeance.toLocaleDateString("fr-FR")}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
