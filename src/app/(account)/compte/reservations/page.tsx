import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { OrderPayment } from "@/components/account/OrderPayment";
import { OrderRow } from "@/components/money/OrderRow";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getMyOrders } from "@/lib/orders";
import { paymentProvider } from "@/lib/payments/fedapay";

/**
 * Réservations du client.
 *
 * Ce que quelqu'un vient chercher ici tient en une question : **qu'est-ce qu'il
 * me reste à payer, et quand ?** Les réservations qui attendent un règlement
 * passent donc devant, avec de quoi régler **sur place** : une réservation
 * immédiate n'a pas de projet où renvoyer le client.
 */

export const metadata = { title: "Mes réservations" };

export default async function AccountBookingsPage() {
  await requireUser();

  const orders = await getMyOrders();
  const sandbox = paymentProvider().sandbox;

  // Ce qui attend un règlement d'abord : c'est la seule chose qui demande une
  // action. Le reste est une archive.
  const aRegler = orders.filter((o) => o.next !== null);
  const soldees = orders.filter((o) => o.next === null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes réservations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {orders.length === 0
            ? "Vous n'avez pas encore de réservation."
            : `${orders.length} réservation${orders.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Aucune réservation"
          description="Réservez un lieu ou un prestataire, ou lancez une demande de devis pour recevoir des propositions."
          action={
            <Link href="/recherche">
              <Button>Explorer le catalogue</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {aRegler.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">À régler</h2>

              {/* Le règlement se fait **ici**, et non derrière un lien. Une
                  réservation immédiate n'a pas de projet où renvoyer le client :
                  après un paiement refusé, il n'avait aucun moyen de réessayer,
                  et sa commande expirait faute de bouton. */}
              <ul className="space-y-4">
                {aRegler.map((order) => (
                  <li key={order.id}>
                    <OrderPayment order={order} requestId={order.requestId ?? ""} sandbox={sandbox} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {soldees.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Réglées</h2>
              <ul className="space-y-3">
                {soldees.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} perspective="client" />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
