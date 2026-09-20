"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, Send } from "lucide-react";

import { markRefundSent, type RefundState } from "@/app/(admin)/admin/(dashboard)/remboursements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, money } from "@/lib/money";
import type { RefundView } from "@/lib/refunds";

/**
 * File des remboursements.
 *
 * **Le numéro du client est affiché au moment d'envoyer**, pas seulement à
 * l'ouverture : c'est ici qu'on peut encore s'apercevoir d'une erreur, et un
 * virement Mobile Money au mauvais compte ne revient pas.
 *
 * Les remboursements dont une part avait **déjà été versée au partenaire**
 * sont signalés en clair. Ils ne se compensent pas tout seuls sur un versement
 * futur : un solde qui devient négatif sans explication est la meilleure façon
 * de perdre un prestataire.
 */

interface Props {
  refunds: readonly RefundView[];
}

const QUAND = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function RefundQueue({ refunds }: Props) {
  const aEnvoyer = refunds.filter((r) => r.status === "pending");
  const historique = refunds.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          À rembourser{aEnvoyer.length > 0 ? ` (${aEnvoyer.length})` : ""}
        </h2>

        {aEnvoyer.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Aucun remboursement en attente.
          </p>
        ) : (
          <ul className="space-y-3">
            {aEnvoyer.map((r) => (
              <PendingRow key={r.id} refund={r} />
            ))}
          </ul>
        )}
      </section>

      {historique.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Historique</h2>
          <ul className="space-y-2">
            {historique.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm"
              >
                <span className="min-w-0 font-medium text-slate-900">
                  {r.clientName ?? "Client"}
                  <span className="ml-2 text-xs text-slate-400">
                    {r.reference}
                    {r.sentAt ? ` · ${QUAND.format(new Date(r.sentAt))}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-700">
                    {format(money(r.amount, r.currency))}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      r.status === "sent" ? "text-teal-700" : "text-slate-400"
                    }`}
                  >
                    {r.statusLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PendingRow({ refund }: { refund: RefundView }) {
  const [state, action, pending] = React.useActionState<RefundState, FormData>(markRefundSent, {});

  return (
    <li className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{refund.clientName ?? "Client"}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {refund.clientPhone ? <strong>{refund.clientPhone}</strong> : "Numéro non renseigné"}
            {refund.orderReference ? ` · ${refund.orderReference}` : ""}
            {refund.partnerName ? ` · ${refund.partnerName}` : ""}
          </p>
        </div>

        <div className="text-right">
          <p className="font-bold tabular-nums text-slate-900">
            {format(money(refund.amount, refund.currency))}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {refund.percent} % du barème
          </p>
        </div>
      </div>

      {refund.reason ? (
        <p className="mt-2 text-xs italic text-slate-600">« {refund.reason} »</p>
      ) : null}

      {refund.needsRecovery ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-orange-100 px-3 py-2 text-xs leading-relaxed text-orange-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Une part de cette somme <strong>a déjà été versée</strong> à{" "}
            {refund.partnerName ?? "ce partenaire"}. Elle est à lui redemander : elle ne sera pas
            déduite automatiquement de son prochain versement.
          </span>
        </p>
      ) : null}

      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="refundId" value={refund.id} />
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Référence de la transaction
          </span>
          <Input name="providerRef" placeholder="Ex. MP260919.1432.A12345" />
        </label>

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Marquer remboursé
        </Button>
      </form>

      {state.message ? (
        <p
          role="status"
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            state.ok ? "text-teal-700" : "text-slate-700"
          }`}
        >
          {state.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
