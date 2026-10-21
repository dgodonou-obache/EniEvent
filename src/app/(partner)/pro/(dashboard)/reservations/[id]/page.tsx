import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, MapPin } from "lucide-react";

import { CancelBooking } from "@/components/account/CancelBooking";
import { DisputeBox } from "@/components/account/DisputeBox";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getOrder } from "@/lib/orders";
import { getOrderDisputes } from "@/lib/reviews";

/**
 * Une réservation, en grand.
 *
 * ⚠️ **Cette page existe parce que la liste est devenue un tableau.** Chaque
 * ligne de `/pro/reservations` portait son bloc d'annulation et sa boîte de
 * litige, dépliés sous elle : trois blocs empilés par réservation, et une page
 * qu'on ne parcourait plus. Un tableau ne peut pas porter cela — et c'est tant
 * mieux, la navigation du dépôt est **liste → fiche** partout ailleurs.
 *
 * Ce qu'un prestataire vient y chercher : **où en est le règlement**, et
 * **que puis-je faire**. Rien d'autre n'y figure.
 */

export const metadata = { title: "Réservation" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function jour(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : JOUR.format(d);
}

export default async function PartnerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const { id } = await params;
  const order = await getOrder(id);

  // La RLS ne rend rien sur la commande d'une autre structure : un 404 est la
  // bonne réponse, et il ne révèle pas que la référence existe.
  if (!order || order.id !== id) notFound();

  const litiges = await getOrderDisputes([order.id]);
  const devise = order.currency as CurrencyCode;
  const somme = (n: number) => format(money(n, devise));

  const reglees = order.instalments.filter((i) => i.paid).length;
  const date = jour(order.eventDate);

  return (
    <div>
      <Link
        href="/pro/reservations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Mes réservations
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{order.reference}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {order.listingTitle ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {order.listingTitle}
                </span>
              ) : null}
              {date ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {date}
                </span>
              ) : null}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {order.statusLabel}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <Fait label="Montant de la réservation">{somme(order.total)}</Fait>
          {/* ⚠️ Ce que le prestataire touche, et la commission à côté. La
              cacher derrière un écran de finances ferait découvrir la retenue
              au virement — c'est-à-dire trop tard pour en discuter. */}
          <Fait label="Vous touchez">
            {somme(order.partnerDue)}
            <span className="block text-xs font-medium text-slate-400">
              commission {somme(order.commission)} · {order.commissionRate} %
            </span>
          </Fait>
          <Fait label="Déjà encaissé">
            {somme(order.paidAmount)}
            <span className="block text-xs font-medium text-slate-400">
              {reglees} sur {order.instalments.length} échéance
              {order.instalments.length > 1 ? "s" : ""}
            </span>
          </Fait>
        </dl>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Échéancier</h2>

        <ol className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          {order.instalments.map((echeance) => (
            <li
              key={echeance.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-50 px-4 py-3 last:border-0"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {echeance.paid ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                )}
                {echeance.label}
              </span>

              <span className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {echeance.paid
                    ? "Réglé"
                    : echeance.pending
                      ? "En cours de confirmation"
                      : (jour(echeance.dueDate) ?? "Date à confirmer")}
                </span>
                <span className="font-bold tabular-nums text-slate-900">
                  {somme(echeance.amount)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* Le versement est la question que le prestataire se pose ici, et la
            réponse évite la réclamation plutôt que d'y répondre. */}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Votre versement part après la prestation, sur ce qui a été réellement encaissé.
        </p>
      </section>

      <section id="annuler" className="mt-6 scroll-mt-6">
        {order.cancellable ? (
          <CancelBooking
            orderId={order.id}
            currency={devise}
            preview={null}
            perspective="partner"
          />
        ) : null}

        <DisputeBox
          orderId={order.id}
          existing={litiges.get(order.id) ?? null}
          perspective="partner"
        />
      </section>
    </div>
  );
}

function Fait({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 font-bold text-slate-900">{children}</dd>
    </div>
  );
}
