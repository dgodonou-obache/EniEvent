import Link from "next/link";
import { Receipt } from "lucide-react";

import { PaymentTable } from "@/components/money/PaymentTable";
import { StatTile } from "@/components/money/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getMyOrders, getMyPayments } from "@/lib/orders";

/**
 * Règlements du client.
 *
 * La ventilation n'y figure pas : ce que la plateforme retient sur un
 * partenaire ne regarde pas l'acheteur. Il voit ce qu'il a payé, et ce qu'il
 * doit encore.
 */

export const metadata = { title: "Mes paiements" };

export default async function AccountPaymentsPage() {
  await requireUser();

  const [lines, orders] = await Promise.all([getMyPayments(), getMyOrders()]);
  const devise = lines[0]?.currency ?? orders[0]?.currency ?? "XOF";

  const regles = lines.filter((l) => l.status === "paid");
  const enCours = lines.filter((l) => l.status === "pending");

  const reste = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((total, o) => total + (o.total - o.paidAmount), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes paiements</h1>
        <p className="mt-1 text-sm text-slate-500">
          L&apos;historique de vos règlements et ce qu&apos;il vous reste à payer.
        </p>
      </div>

      {lines.length === 0 && reste === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucun règlement"
          description="Vos paiements apparaîtront ici dès votre première réservation, avec leur reçu et leur état."
          action={
            <Link href="/recherche">
              <Button>Explorer le catalogue</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Déjà réglé"
              amount={regles.reduce((t, l) => t + l.amount, 0)}
              currency={devise}
              tone="encaisse"
              hint={`${regles.length} règlement${regles.length > 1 ? "s" : ""} confirmé${regles.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Reste à payer"
              amount={reste}
              currency={devise}
              tone="attente"
              hint="Échéances à venir sur vos réservations en cours"
            />
            <StatTile
              label="En cours de confirmation"
              amount={enCours.reduce((t, l) => t + l.amount, 0)}
              currency={devise}
              hint="Règlements ouverts, pas encore confirmés par l'opérateur"
            />
          </div>

          {lines.length > 0 ? (
            <>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Historique</h2>
              <PaymentTable lines={lines} />
            </>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Aucun règlement encore enregistré. Retrouvez ce qu&apos;il vous reste à payer dans{" "}
              <Link href="/compte/reservations" className="font-semibold text-orange-600">
                vos réservations
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
