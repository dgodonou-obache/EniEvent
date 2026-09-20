import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { CancelBooking } from "@/components/account/CancelBooking";
import { OrderPayment } from "@/components/account/OrderPayment";
import { OrderRow } from "@/components/money/OrderRow";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/money";
import { getMyOrders } from "@/lib/orders";
import { paymentProvider } from "@/lib/payments/fedapay";
import { previewCancellation, type CancellationPreview } from "@/lib/refunds";

/**
 * Réservations du client.
 *
 * Ce que quelqu'un vient chercher ici tient en deux questions : **qu'est-ce
 * qu'il me reste à payer**, et **puis-je encore annuler ?** Les réservations
 * qui attendent un règlement passent donc devant, avec de quoi régler **sur
 * place** : une réservation immédiate n'a pas de projet où renvoyer le client.
 *
 * La retenue en cas d'annulation est calculée **ici, avant l'affichage** : la
 * découvrir après avoir cliqué se lirait comme un prélèvement abusif.
 */

export const metadata = { title: "Mes réservations" };

export default async function AccountBookingsPage() {
  await requireUser();

  const orders = await getMyOrders();
  const sandbox = paymentProvider().sandbox;

  const annulees = orders.filter((o) => o.status === "cancelled" || o.status === "refunded");
  const vivantes = orders.filter((o) => !annulees.includes(o));

  // Ce qui attend un règlement d'abord : c'est la seule chose qui demande une
  // action. Le reste est une archive.
  const aRegler = vivantes.filter((o) => o.next !== null);
  const confirmees = vivantes.filter((o) => o.next === null);

  // Une seule salve, et seulement pour ce qui est encore annulable : calculer
  // un barème sur une réservation passée serait du travail pour rien.
  const apercus = new Map<string, CancellationPreview | null>(
    await Promise.all(
      vivantes
        .filter((o) => o.cancellable)
        .map(async (o) => [o.id, await previewCancellation(o.id)] as const),
    ),
  );

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
                    {order.cancellable ? (
                      <CancelBooking
                        orderId={order.id}
                        currency={order.currency as CurrencyCode}
                        preview={apercus.get(order.id) ?? null}
                        perspective="client"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {confirmees.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Confirmées</h2>
              <ul className="space-y-3">
                {confirmees.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} perspective="client" />
                    {order.cancellable ? (
                      <CancelBooking
                        orderId={order.id}
                        currency={order.currency as CurrencyCode}
                        preview={apercus.get(order.id) ?? null}
                        perspective="client"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {annulees.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Annulées</h2>
              <ul className="space-y-3">
                {annulees.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} perspective="client" />
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Les remboursements sont versés à la main, sous quelques jours ouvrés. Vous
                retrouvez le détail de chaque règlement dans{" "}
                <Link href="/compte/paiements" className="font-semibold text-orange-600">
                  vos paiements
                </Link>
                .
              </p>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
