"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import { cancelOrder, type CancelState } from "@/app/(account)/compte/reservations/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, money, type CurrencyCode } from "@/lib/money";
import type { CancellationPreview } from "@/lib/refunds";

/**
 * Annuler une réservation.
 *
 * **La retenue s'annonce avant, jamais après.** Un remboursement partiel que
 * le client découvre une fois l'annulation faite se lit comme un prélèvement
 * abusif — c'est le premier motif de litige d'une place de marché. L'écran
 * affiche donc la somme exacte, pas le taux à appliquer soi-même, et pas le
 * seul intitulé du barème.
 *
 * **Deux gestes, comme pour les versements.** Le premier ouvre, le second
 * confirme. Une annulation ne se rattrape pas : la date repart au catalogue et
 * un autre client peut la prendre dans la minute.
 */

interface Props {
  orderId: string;
  currency: CurrencyCode;
  preview: CancellationPreview | null;
  /** Le partenaire ne lit pas la même chose : il ne se rembourse pas lui-même. */
  perspective: "client" | "partner";
}

export function CancelBooking({ orderId, currency, preview, perspective }: Props) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<CancelState, FormData>(cancelOrder, {});

  const somme = (n: number) => format(money(n, currency));

  if (state.ok) {
    return (
      <p
        role="status"
        className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900"
      >
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
      >
        Annuler cette réservation
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <input type="hidden" name="orderId" value={orderId} />

      <p className="flex items-start gap-2 text-sm font-bold text-slate-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
        {perspective === "client"
          ? "Annuler cette réservation ?"
          : "Vous désister de cette réservation ?"}
      </p>

      {perspective === "partner" ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-700">
          En vous désistant, <strong>le client est intégralement remboursé</strong> : votre
          barème d&apos;annulation ne vous protège que d&apos;un changement d&apos;avis de sa
          part. La date redevient disponible dans votre planning.
        </p>
      ) : preview ? (
        <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-700">
          {preview.paid === 0 ? (
            <p>Vous n&apos;avez encore rien réglé : cette annulation ne vous coûte rien.</p>
          ) : (
            <>
              <p className="flex items-baseline justify-between gap-4">
                <span>Déjà réglé</span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {somme(preview.paid)}
                </span>
              </p>
              <p className="flex items-baseline justify-between gap-4">
                <span>Remboursé</span>
                <span className="font-bold tabular-nums text-teal-700">
                  {somme(preview.refunded)}
                </span>
              </p>
              {preview.retained > 0 ? (
                <p className="flex items-baseline justify-between gap-4">
                  <span>Acquis au prestataire</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {somme(preview.retained)}
                  </span>
                </p>
              ) : null}
            </>
          )}

          {preview.policySummary ? (
            <p className="mt-2 border-t border-orange-200/70 pt-2 text-slate-600">
              {preview.policySummary}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Motif (facultatif, transmis à{" "}
          {perspective === "client" ? "votre prestataire" : "votre client"})
        </span>
        <Textarea name="reason" rows={2} placeholder="Ex. changement de date de l'événement" />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {perspective === "client" ? "Confirmer l'annulation" : "Confirmer le désistement"}
        </Button>

        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Revenir
        </button>
      </div>

      {state.message ? (
        <p role="alert" className="mt-2 text-xs text-slate-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
