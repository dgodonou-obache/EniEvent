import Link from "next/link";

import { StatTile } from "@/components/money/StatTile";
import { getAdminReport } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/money";

/**
 * Les chiffres de l'activité.
 *
 * ⚠️ **On montre l'encaissé, jamais le commandé.** Une commande ouverte n'est
 * pas un revenu : elle peut rester impayée ou être annulée. Additionner les
 * totaux de commandes donnerait un chiffre flatteur et faux, et c'est
 * exactement le genre de tableau de bord sur lequel on prend une mauvaise
 * décision — embaucher, baisser une commission.
 *
 * **La commission est présentée comme ce qu'elle est : le seul revenu.** Le
 * client ne paie aucun frais (migration 0034) ; tout ce qui entre est soit la
 * part du partenaire, soit la nôtre, et les deux s'additionnent exactement à
 * l'encaissé.
 *
 * Aucun taux de croissance, aucune comparaison à la période précédente tant
 * que l'historique ne le permet pas : un « +300 % » sur deux commandes
 * tromperait autant qu'une note inventée (règle §5).
 */

export const metadata = { title: "Rapports" };

const PERIODES = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "12 mois" },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string }>;
}) {
  await requireUser("/admin/connexion");

  const { jours } = await searchParams;
  const demande = Number(jours);
  const days = PERIODES.some((p) => p.days === demande) ? demande : 30;

  const report = await getAdminReport(days);
  const devise = report.currency as CurrencyCode;

  const rienEncaisse = report.collected === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rapports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce qui est réellement entré sur les {days} derniers jours. Les commandes ouvertes mais
          non réglées n&apos;y figurent pas.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Link
            key={p.days}
            href={`/admin/rapports?jours=${p.days}`}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.98] ${
              p.days === days
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {rienEncaisse ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">Aucun encaissement sur la période.</span> C&apos;est attendu
          tant que FedaPay tourne en bac à sable : les paiements de test ne comptent pas comme des
          revenus. Le compte marchand doit être validé pour que ces chiffres aient un sens.
        </p>
      ) : null}

      <h2 className="mb-3 text-sm font-bold text-slate-900">L&apos;argent</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Encaissé"
          amount={report.collected}
          currency={devise}
          tone="encaisse"
          hint="Ce que les clients ont réellement réglé"
        />
        <StatTile
          label="Commission"
          amount={report.commission}
          currency={devise}
          hint="Le seul revenu de la plateforme, prélevé sur la part du partenaire"
        />
        <StatTile
          label="Part des partenaires"
          amount={report.partnerDue}
          currency={devise}
          hint="Dû aux prestataires, versé après la prestation"
        />
        <StatTile
          label="Remboursé"
          amount={report.refunded}
          currency={devise}
          tone="attente"
          hint="Rendu aux clients après annulation"
        />
      </div>

      <h2 className="mb-3 text-sm font-bold text-slate-900">L&apos;activité</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Compteur
          label="Commandes ouvertes"
          value={report.ordersCreated}
          hint={
            report.ordersCancelled > 0
              ? `dont ${report.ordersCancelled} annulée${report.ordersCancelled > 1 ? "s" : ""}`
              : "aucune annulation"
          }
        />
        <Compteur
          label="Nouveaux comptes"
          value={report.newAccounts}
          hint={
            report.newPartners > 0
              ? `dont ${report.newPartners} partenaire${report.newPartners > 1 ? "s" : ""}`
              : "aucun partenaire"
          }
        />
        <Compteur
          label="Annonces publiées"
          value={report.listingsPublished}
          hint="Validées par la modération sur la période"
        />
      </div>
    </div>
  );
}

function Compteur({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}
