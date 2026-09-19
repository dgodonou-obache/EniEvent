"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, Send, X } from "lucide-react";

import {
  cancelPayout,
  preparePayout,
  sendPayout,
  type PayoutState,
} from "@/app/(admin)/admin/(dashboard)/versements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, money, type CurrencyCode } from "@/lib/money";
import type { PayoutCandidate, PayoutView } from "@/lib/payouts";

/**
 * File des versements.
 *
 * **Préparer et envoyer sont séparés à dessein.** Préparer fige le montant et
 * rattache les encaissements ; envoyer consigne que l'argent est parti. Entre
 * les deux, on peut relire le numéro et le nom du titulaire — un virement
 * Mobile Money envoyé au mauvais compte ne revient pas.
 *
 * Les partenaires sans coordonnées apparaissent quand même, en défaut : les
 * masquer donnerait l'illusion qu'on ne leur doit rien.
 */

interface Props {
  candidates: readonly PayoutCandidate[];
  payouts: readonly PayoutView[];
}

export function PayoutQueue({ candidates, payouts }: Props) {
  const enAttente = payouts.filter((p) => p.status === "pending");
  const historique = payouts.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">À préparer</h2>

        {candidates.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Rien à verser : tous les encaissements sont déjà rattachés à un versement.
          </p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((c) => (
              <CandidateRow key={c.orgId} candidate={c} />
            ))}
          </ul>
        )}
      </section>

      {enAttente.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">
            Préparés, à envoyer ({enAttente.length})
          </h2>
          <ul className="space-y-3">
            {enAttente.map((p) => (
              <PendingRow key={p.id} payout={p} />
            ))}
          </ul>
        </section>
      ) : null}

      {historique.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Historique</h2>
          <ul className="space-y-2">
            {historique.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {p.orgName}
                  <span className="ml-2 text-xs text-slate-400">{p.reference}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-700">
                    {format(money(p.amount, p.currency))}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      p.status === "sent" ? "text-teal-700" : "text-slate-400"
                    }`}
                  >
                    {p.statusLabel}
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

function CandidateRow({ candidate }: { candidate: PayoutCandidate }) {
  const [state, action, pending] = React.useActionState<PayoutState, FormData>(preparePayout, {});
  const sansCoordonnees = candidate.account === null;

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{candidate.orgName}</p>
          {sansCoordonnees ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-orange-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Coordonnées de versement non renseignées
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              {candidate.account?.holder_name}
              {candidate.account?.phone ? ` · ${candidate.account.phone}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-bold tabular-nums text-slate-900">
            {format(money(candidate.amount, candidate.currency as CurrencyCode))}
          </span>

          <form action={action}>
            <input type="hidden" name="orgId" value={candidate.orgId} />
            <Button type="submit" size="sm" disabled={pending || sansCoordonnees}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Préparer
            </Button>
          </form>
        </div>
      </div>

      {state.message ? (
        <p role="status" className="mt-2 text-xs text-slate-600">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}

function PendingRow({ payout }: { payout: PayoutView }) {
  const [envoi, envoyer, enCours] = React.useActionState<PayoutState, FormData>(sendPayout, {});
  const [annul, annuler, annulation] = React.useActionState<PayoutState, FormData>(
    cancelPayout,
    {},
  );

  return (
    <li className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{payout.orgName}</p>
          {/* Le numéro et le nom sont affichés au moment de l'envoi, et non
              seulement à la préparation : c'est ici qu'on peut encore corriger. */}
          <p className="mt-0.5 text-xs text-slate-600">
            {payout.methodLabel} · <strong>{payout.holderName}</strong>
            {payout.phone ? ` · ${payout.phone}` : ""}
          </p>
        </div>
        <span className="font-bold tabular-nums text-slate-900">
          {format(money(payout.amount, payout.currency))}
        </span>
      </div>

      <form action={envoyer} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="payoutId" value={payout.id} />
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Référence de la transaction
          </span>
          <Input name="providerRef" placeholder="Ex. MP260919.1432.A12345" />
        </label>

        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Marquer envoyé
        </Button>
      </form>

      <form action={annuler} className="mt-2">
        <input type="hidden" name="payoutId" value={payout.id} />
        <button
          type="submit"
          disabled={annulation}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Annuler ce versement
        </button>
      </form>

      {envoi.message || annul.message ? (
        <p
          role="status"
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            envoi.ok || annul.ok ? "text-teal-700" : "text-slate-700"
          }`}
        >
          {envoi.ok || annul.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          {envoi.message || annul.message}
        </p>
      ) : null}
    </li>
  );
}
