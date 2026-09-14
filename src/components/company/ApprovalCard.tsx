"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CheckCircle2, Info, Loader2, X } from "lucide-react";

import { decideApproval, type CompanyState } from "@/app/(company)/entreprise/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, money, type CurrencyCode } from "@/lib/money";

/**
 * Un engagement soumis à l'aval d'un valideur.
 *
 * Le valideur décide avec tout le contexte sous les yeux — qui demande, pour
 * quel projet, sur quel centre de coût, et ce qu'il reste dessus. Un écran qui
 * n'afficherait qu'un montant et deux boutons ferait valider à l'aveugle.
 *
 * Accorder l'aval **retient l'offre** dans la même transaction : un aller-retour
 * de plus laisserait une offre validée mais non retenue, et le prestataire dans
 * l'attente sans rien pour l'expliquer.
 */

export interface ApprovalView {
  id: string;
  subject: "quote" | "quote_request";
  amount: number | null;
  currency: string;
  status: string;
  reason: string | null;
  createdAt: string;
  requester: string | null;
  costCenter: { code: string; name: string } | null;
  /** Ce qu'il reste sur le centre de coût, enveloppe comprise. */
  remaining: number | null;
  title: string;
  subtitle: string;
  href: string | null;
  supplier: string | null;
  message: string | null;
}

export function ApprovalCard({
  approval,
  canDecide,
}: {
  approval: ApprovalView;
  canDecide: boolean;
}) {
  const [refusing, setRefusing] = React.useState(false);
  const [state, formAction, pending] = React.useActionState<CompanyState, FormData>(
    decideApproval,
    {},
  );

  const currency = (approval.currency ?? "XOF") as CurrencyCode;
  const amount = approval.amount ?? 0;

  // Ce qui doit sauter aux yeux : l'engagement dépasse ce qu'il reste.
  const overBudget = approval.remaining != null && amount > approval.remaining;

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-bold text-slate-900">{approval.title}</h2>
            {approval.costCenter ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {approval.costCenter.code}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Sans centre de coût
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">{approval.subtitle}</p>

          <p className="mt-1 text-sm text-slate-500">
            Demandé par {approval.requester ?? "un collègue"} ·{" "}
            {new Date(approval.createdAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {format(money(amount, currency))}
          </p>
          {approval.remaining != null ? (
            <p className={`text-xs tabular-nums ${overBudget ? "text-red-600" : "text-slate-400"}`}>
              {overBudget
                ? `dépasse de ${format(money(amount - approval.remaining, currency))}`
                : `${format(money(approval.remaining, currency))} restant`}
            </p>
          ) : null}
        </div>
      </div>

      {approval.supplier ? (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-bold">Prestataire : </span>
          {approval.supplier}
        </p>
      ) : null}

      {approval.message ? (
        <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {approval.message}
        </p>
      ) : null}

      {overBudget ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Cet engagement dépasse ce qu&apos;il reste sur le centre de coût. Rien ne
          l&apos;interdit — mais la décision vous revient en connaissance de cause.
        </p>
      ) : null}

      {approval.href ? (
        <Link
          href={approval.href}
          className="mt-3 inline-block text-sm font-bold text-orange-600 hover:underline"
        >
          Voir le dossier complet
        </Link>
      ) : null}

      {canDecide && approval.status === "pending" ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {refusing ? (
            <form action={formAction} className="space-y-2">
              <input type="hidden" name="approvalId" value={approval.id} />
              <input type="hidden" name="decision" value="reject" />
              <Textarea
                name="reason"
                rows={2}
                placeholder="Pourquoi refusez-vous ? Une phrase suffit, et elle dit au demandeur quoi corriger."
              />
              {state.errors?.reason ? (
                <p role="alert" className="text-xs text-red-600">
                  {state.errors.reason}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" variant="outline" size="sm" disabled={pending}>
                  Confirmer le refus
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRefusing(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form action={formAction}>
                <input type="hidden" name="approvalId" value={approval.id} />
                <input type="hidden" name="decision" value="approve" />
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {approval.subject === "quote" ? "Approuver et retenir l'offre" : "Approuver"}
                </Button>
              </form>

              <Button type="button" variant="ghost" size="sm" onClick={() => setRefusing(true)}>
                <X className="h-3.5 w-3.5" aria-hidden />
                Refuser
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {!canDecide && approval.status === "pending" ? (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
          En attente d&apos;un valideur. Votre rôle ne permet pas de décider.
        </p>
      ) : null}

      {approval.status === "rejected" && approval.reason ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span className="font-bold">Motif du refus : </span>
          {approval.reason}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            state.ok ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
