"use client";

import * as React from "react";
import { Check, Loader2, Scale, Undo2 } from "lucide-react";

import { resolveDispute, type DisputeState } from "@/app/(admin)/admin/(dashboard)/litiges/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, money, type CurrencyCode } from "@/lib/money";
import type { AdminDispute } from "@/lib/reviews";

/**
 * Un litige à arbitrer.
 *
 * **La somme affichée est l'encaissé, pas le total.** C'est elle qui est en
 * jeu : un litige sur une réservation de 600 000 F dont seul l'acompte de
 * 180 000 F a été réglé ne porte que sur 180 000 F. Montrer le total ferait
 * arbitrer de travers.
 *
 * ⚠️ **Aucun bouton ne rembourse ici.** Le remboursement passe par
 * l'annulation, qui applique le barème figé sur la commande ; cet écran
 * rattache le remboursement produit et consigne la décision. Un second chemin
 * vers l'argent serait un second endroit où se tromper.
 */
export function DisputeCard({ dispute }: { dispute: AdminDispute }) {
  const [state, action, pending] = React.useActionState<DisputeState, FormData>(
    resolveDispute,
    {},
  );

  const devise = (dispute.orderCurrency as CurrencyCode) ?? "XOF";
  const somme = (n: number) => format(money(n, devise));
  const clos = !["open", "under_review"].includes(dispute.status);

  if (state.message) {
    return (
      <article className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
        <p role="status" className="flex items-start gap-2 text-sm leading-relaxed text-teal-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Scale className="h-4 w-4 text-orange-500" aria-hidden />
            {dispute.side === "client"
              ? "Le client conteste"
              : "Le prestataire conteste"}
            <span className="font-mono text-xs font-medium text-slate-400">
              {dispute.reference}
            </span>
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {dispute.orgName} · {dispute.clientLabel} ·{" "}
            {dispute.listingTitle ?? "prestation sur devis"}
          </p>
        </div>
        <time dateTime={dispute.createdAt} className="shrink-0 text-xs text-slate-400">
          {new Date(dispute.createdAt).toLocaleDateString("fr-FR")}
        </time>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chiffre label="Encaissé" value={somme(dispute.paidAmount)} fort />
        <Chiffre label="Total commandé" value={somme(dispute.orderTotal)} />
        <Chiffre label="Réservation" value={dispute.orderReference} />
        <Chiffre
          label="Prestation"
          value={
            dispute.eventDate
              ? new Date(dispute.eventDate).toLocaleDateString("fr-FR")
              : "sans date"
          }
        />
      </dl>

      <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
        {dispute.reason}
      </p>

      {dispute.refundReference ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <Undo2 className="h-3.5 w-3.5 text-teal-600" aria-hidden />
          Remboursement rattaché : {dispute.refundReference}
          {dispute.refundAmount != null ? ` — ${somme(dispute.refundAmount)}` : ""}
        </p>
      ) : null}

      {clos ? (
        <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-700">
          <span className="font-bold text-slate-900">{LIBELLE_ISSUE[dispute.status]} — </span>
          {dispute.resolution ?? "Sans commentaire."}
        </p>
      ) : (
        <form action={action} className="mt-4 border-t border-slate-100 pt-4">
          <input type="hidden" name="disputeId" value={dispute.id} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Votre décision — 30 caractères au minimum. Les deux parties la liront.
            </span>
            <Textarea
              name="note"
              rows={3}
              placeholder="Ce que nous avons établi, et ce que nous en concluons."
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Remboursement rattaché (facultatif) — son identifiant, s&apos;il a déjà été créé
              par une annulation
            </span>
            <input
              type="text"
              name="refundId"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs transition-all duration-300 focus:border-orange-300 focus:bg-white focus:outline-none"
              placeholder="Laissez vide si aucun remboursement n'a été émis"
            />
          </label>

          {/* ⚠️ L'issue voyage par le bouton, jamais par un champ caché qu'un
              `onClick` modifierait : un bouton de soumission transmet son `name`
              et sa `value`, donc aucun état, donc aucune course entre le rendu
              et la sérialisation (§6 du guide). */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              name="issue"
              value="resolved_refund"
              size="sm"
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              En faveur du client
            </Button>

            <Button
              type="submit"
              name="issue"
              value="resolved_partner"
              size="sm"
              variant="outline"
              disabled={pending}
            >
              En faveur du prestataire
            </Button>

            {dispute.status === "open" ? (
              <Button
                type="submit"
                name="issue"
                value="under_review"
                size="sm"
                variant="ghost"
                disabled={pending}
              >
                Prendre en charge
              </Button>
            ) : null}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Trancher en faveur du client <strong>ne rembourse rien d&apos;ici</strong> : le
            remboursement se fait par l&apos;annulation, qui applique le barème de la
            commande. Annulez d&apos;abord, puis rattachez le remboursement ci-dessus.
          </p>

          {state.error ? (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600">
              {state.error}
            </p>
          ) : null}
        </form>
      )}
    </article>
  );
}

const LIBELLE_ISSUE: Record<string, string> = {
  resolved_refund: "Tranché en faveur du client",
  resolved_partner: "Tranché en faveur du prestataire",
  withdrawn: "Retiré par son auteur",
};

function Chiffre({
  label,
  value,
  fort,
}: {
  label: string;
  value: string;
  fort?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 p-2.5">
      <dt className="micro-label text-slate-400">{label}</dt>
      <dd
        className={`mt-1 truncate text-sm tabular-nums ${
          fort ? "font-bold text-slate-900" : "font-medium text-slate-600"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
