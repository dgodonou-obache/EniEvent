"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";

import { payOrder, type PaymentState } from "@/app/(account)/projets/paiement";
import { Button } from "@/components/ui/button";
import { format, money, type CurrencyCode } from "@/lib/money";
import type { InstalmentView, OrderView } from "@/lib/orders";

/**
 * Règlement d'une commande, échéance par échéance.
 *
 * Trois exigences de fond, qui expliquent la forme :
 *
 * - **Aucun montant n'est envoyé au serveur.** Le formulaire ne désigne qu'une
 *   échéance ; la somme est déduite en base. Ce qui est affiché ici n'est qu'un
 *   reflet.
 * - **L'échéancier entier est visible dès le premier règlement.** Un client qui
 *   découvre après avoir payé qu'il reste deux versements abandonne, et il a
 *   raison. `CLAUDE.md` §5 : pas de surprise au moment de payer.
 * - **Les échéances se règlent dans l'ordre**, comme `start_payment` l'impose.
 *   Seule la prochaine porte un bouton ; les suivantes s'affichent en attente,
 *   pour être lues sans être offertes.
 */

interface Props {
  order: OrderView;
  requestId: string;
  /** Vrai en bac à sable : il faut le dire, un faux paiement se confond vite. */
  sandbox: boolean;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function quand(echeance: InstalmentView): string {
  if (!echeance.dueDate) return "Date à confirmer";

  const d = new Date(`${echeance.dueDate}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "Date à confirmer" : JOUR.format(d);
}

export function OrderPayment({ order, requestId, sandbox }: Props) {
  const [state, action, pending] = React.useActionState<PaymentState, FormData>(payOrder, {});

  // Le prestataire présente sa propre page : on y envoie le client dès que
  // l'ouverture a réussi. Dans un effet, jamais pendant le rendu — une
  // redirection est une conséquence, pas un calcul.
  React.useEffect(() => {
    if (state.ok && state.url) window.location.assign(state.url);
  }, [state.ok, state.url]);

  const devise = order.currency as CurrencyCode;
  const somme = (n: number) => format(money(n, devise));

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">
          {order.partnerName ?? "Prestation retenue"}
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {order.reference} · {order.statusLabel}
        </span>
      </header>

      <p className="mt-3 flex items-baseline justify-between gap-4 text-sm">
        <span className="text-slate-500">Montant retenu</span>
        <span className="text-lg font-bold text-slate-900">{somme(order.total)}</span>
      </p>

      <ol className="mt-4 space-y-2">
        {order.instalments.map((echeance) => {
          const prochaine = order.next?.id === echeance.id;

          return (
            <li
              key={echeance.id}
              className={`rounded-xl border p-3 transition-all duration-300 ${
                prochaine
                  ? "border-orange-200 bg-orange-50"
                  : echeance.paid
                    ? "border-slate-100 bg-white"
                    : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {echeance.paid ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                  ) : echeance.pending ? (
                    <Clock className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
                  ) : (
                    <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  )}
                  {echeance.label}
                </span>
                <span className="font-bold text-slate-900">{somme(echeance.amount)}</span>
              </div>

              <p className="mt-1 pl-6 text-xs text-slate-500">
                {echeance.paid
                  ? "Réglé"
                  : echeance.pending
                    ? "Règlement en cours de confirmation"
                    : prochaine
                      ? "À régler maintenant"
                      : `À régler le ${quand(echeance)}`}
              </p>

              {prochaine ? (
                <form action={action} className="mt-3 pl-6">
                  <input type="hidden" name="instalmentId" value={echeance.id} />
                  <input type="hidden" name="requestId" value={requestId} />

                  <Button type="submit" disabled={pending} className="w-full sm:w-auto">
                    {pending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Ouverture du paiement…
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" aria-hidden />
                        Régler {somme(echeance.amount)}
                      </>
                    )}
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>

      {order.paidAmount > 0 && order.paidAmount < order.total ? (
        <p className="mt-4 text-sm text-slate-500">
          Déjà réglé : <strong className="text-slate-900">{somme(order.paidAmount)}</strong> sur{" "}
          {somme(order.total)}
        </p>
      ) : null}

      {order.next ? (
        <>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
            Paiement par Mobile Money ou carte, sur la page sécurisée de notre prestataire.
            ÉniEvent ne voit jamais vos identifiants de paiement.
          </p>

          {sandbox ? (
            <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
              Mode test : aucun argent réel ne sera débité.
            </p>
          ) : null}
        </>
      ) : null}

      {state.message ? (
        <p role="alert" className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
