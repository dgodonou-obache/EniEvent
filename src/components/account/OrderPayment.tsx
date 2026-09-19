"use client";

import * as React from "react";
import { CheckCircle2, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";

import { payOrder, type PaymentState } from "@/app/(account)/projets/paiement";
import { Button } from "@/components/ui/button";
import { format, money, type CurrencyCode } from "@/lib/money";
import type { OrderView } from "@/lib/orders";

/**
 * Règlement d'une commande.
 *
 * Deux exigences de fond, qui expliquent la forme :
 *
 * - **Aucun montant n'est envoyé au serveur.** Le formulaire ne transmet que la
 *   commande et la nature du règlement ; la somme est déduite en base. Ce qui
 *   est affiché ici n'est qu'un reflet.
 * - **Le détail se dit avant de payer.** Acompte, solde restant, échéance :
 *   `CLAUDE.md` §5 interdit le jargon et les surprises. Un client qui découvre
 *   qu'il reste 70 % à régler après avoir payé abandonne, et il a raison.
 */

interface Props {
  order: OrderView;
  requestId: string;
  /** Vrai en bac à sable : il faut le dire, un faux paiement se confond vite. */
  sandbox: boolean;
}

export function OrderPayment({ order, requestId, sandbox }: Props) {
  const [state, action, pending] = React.useActionState<PaymentState, FormData>(payOrder, {});

  // Le prestataire présente sa propre page : on y envoie le client dès que
  // l'ouverture a réussi. `useEffect` et non pendant le rendu — une redirection
  // est un effet, pas un calcul.
  React.useEffect(() => {
    if (state.ok && state.url) window.location.assign(state.url);
  }, [state.ok, state.url]);

  const devise = order.currency as CurrencyCode;
  const somme = (n: number) => format(money(n, devise));

  const regle = order.payments.filter((p) => p.status === "paid");
  const restant = order.nextPurpose ? order.nextAmount : 0;

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

      <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Montant retenu</dt>
          <dd className="font-bold text-slate-900">{somme(order.total)}</dd>
        </div>

        {order.depositAmount > 0 && order.depositAmount < order.total ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                Acompte demandé{" "}
                <span className="text-slate-400">({order.depositPercent} %)</span>
              </dt>
              <dd className="font-medium text-slate-700">{somme(order.depositAmount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Solde avant la prestation</dt>
              <dd className="font-medium text-slate-700">{somme(order.balanceAmount)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {regle.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {regle.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
              <span>
                {p.purposeLabel} de <strong className="text-slate-900">{somme(p.amount)}</strong>{" "}
                réglé
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {order.payments.some((p) => p.status === "pending") && !order.nextPurpose ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Clock className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
          Un règlement est en cours de confirmation.
        </p>
      ) : null}

      {order.nextPurpose ? (
        <form action={action} className="mt-5">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="purpose" value={order.nextPurpose} />
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
                Régler {order.nextPurpose === "balance" ? "le solde" : "l'acompte"} —{" "}
                {somme(restant)}
              </>
            )}
          </Button>

          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
            Paiement par Mobile Money ou carte, sur la page sécurisée de notre prestataire.
            ÉniEvent ne voit jamais vos identifiants de paiement.
          </p>

          {sandbox ? (
            <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
              Mode test : aucun argent réel ne sera débité.
            </p>
          ) : null}
        </form>
      ) : null}

      {state.message ? (
        <p role="alert" className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
