import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { OrderRow } from "@/components/money/OrderRow";
import { StatTile } from "@/components/money/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getPartnerOrders } from "@/lib/orders";

/**
 * Réservations reçues par un partenaire.
 *
 * Une commande naît d'un devis accepté ou d'une réservation immédiate ; les
 * deux se lisent ici de la même façon. L'ordre est le plus récent d'abord :
 * c'est ce qui appelle une action.
 */

export const metadata = { title: "Mes réservations" };

export default async function PartnerBookingsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orders = await getPartnerOrders(decision.org.orgId);
  const devise = orders[0]?.currency ?? "XOF";

  const encours = orders.filter((o) => o.status === "pending_payment" || o.status === "deposit_paid");
  const soldees = orders.filter((o) => o.status === "paid");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes réservations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {orders.length === 0
            ? "Aucune réservation pour l'instant."
            : `${orders.length} réservation${orders.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Aucune réservation pour l'instant"
          description="Une réservation naît d'un devis accepté, ou d'un client qui réserve directement une de vos annonces. Vérifiez que vos annonces sont publiées et votre planning ouvert."
          action={
            <Link href="/pro/annonces">
              <Button>Voir mes annonces</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="En cours"
              amount={encours.reduce((t, o) => t + o.partnerDue, 0)}
              currency={devise}
              tone="attente"
              hint={`${encours.length} réservation${encours.length > 1 ? "s" : ""} pas encore soldée${encours.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Soldées"
              amount={soldees.reduce((t, o) => t + o.partnerDue, 0)}
              currency={devise}
              tone="encaisse"
              hint={`${soldees.length} réservation${soldees.length > 1 ? "s" : ""} intégralement réglée${soldees.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Volume total"
              amount={orders.reduce((t, o) => t + o.total, 0)}
              currency={devise}
              hint="Ce que les clients ont engagé, commission comprise"
            />
          </div>

          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} perspective="partner" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
