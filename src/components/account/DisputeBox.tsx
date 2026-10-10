"use client";

import * as React from "react";
import { Check, Loader2, Scale, X } from "lucide-react";

import {
  openDispute,
  withdrawDispute,
  type DisputeState,
} from "@/app/(account)/compte/reservations/dispute-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Contester une réservation.
 *
 * **Le dernier recours, et l'écran le dit.** Un litige n'est pas une annulation
 * et ne la remplace pas : il s'ouvre quand l'argent a déjà bougé et que les
 * deux parties ne sont pas d'accord sur ce qui s'est passé. Proposé trop
 * facilement, il remplacerait la messagerie — qui règle la plupart des
 * désaccords sans arbitre.
 *
 * **Trente caractères au minimum**, parce que c'est sur ce récit que l'équipe
 * tranchera. « Pas content » ne permet d'arbitrer dans aucun sens.
 *
 * Un litige déjà ouvert affiche son état, et son auteur — et lui seul — peut le
 * retirer : les deux parties s'arrangent souvent entre elles, et il faut une
 * sortie qui ne soit pas une décision de la plateforme.
 */

const LIBELLE: Record<string, string> = {
  open: "en attente de prise en charge",
  under_review: "en cours d'examen",
  resolved_refund: "tranché en faveur du client",
  resolved_partner: "tranché en faveur du prestataire",
  withdrawn: "retiré",
};

export function DisputeBox({
  orderId,
  existing,
  perspective,
}: {
  orderId: string;
  /** Le litige déjà ouvert sur cette réservation, s'il y en a un. */
  existing: { id: string; reference: string; status: string; side: string } | null;
  /** Qui regarde : les deux côtés lisent la même chose, pas la même phrase. */
  perspective: "client" | "partner";
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<DisputeState, FormData>(openDispute, {});
  const [retrait, retraitAction, retraitPending] = React.useActionState<DisputeState, FormData>(
    withdrawDispute,
    {},
  );

  if (state.ok || retrait.ok) {
    return (
      <p
        role="status"
        className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900"
      >
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.message ?? retrait.message}
      </p>
    );
  }

  if (existing) {
    const parMoi =
      (perspective === "client" && existing.side === "client") ||
      (perspective === "partner" && existing.side === "partner");
    const enCours = existing.status === "open" || existing.status === "under_review";

    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <Scale className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <span className="font-bold text-slate-900">Litige {existing.reference}</span>
          <span className="text-slate-500">
            {LIBELLE[existing.status] ?? existing.status}
            {parMoi ? " — ouvert par vous" : " — ouvert par l'autre partie"}
          </span>
        </p>

        {enCours ? (
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            {parMoi
              ? "Nous examinons votre demande. Aucune somme ne bouge entre-temps."
              : "Répondez-nous par message : nous ne trancherons pas sans avoir lu votre version."}
          </p>
        ) : null}

        {parMoi && enCours ? (
          <form action={retraitAction} className="mt-2">
            <input type="hidden" name="disputeId" value={existing.id} />
            <input
              type="text"
              name="note"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs transition-all duration-300 focus:border-orange-300 focus:outline-none"
              placeholder="Vous vous êtes arrangés ? Dites-nous comment (facultatif)"
            />
            <Button type="submit" size="sm" variant="ghost" className="mt-2" disabled={retraitPending}>
              {retraitPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Retirer mon litige
            </Button>
            {retrait.message ? (
              <p role="alert" className="mt-1 text-xs text-slate-700">
                {retrait.message}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-all duration-200 hover:text-slate-700"
      >
        <Scale className="h-3 w-3" aria-hidden />
        Un problème sur cette réservation ?
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <input type="hidden" name="orderId" value={orderId} />

      <p className="text-sm font-bold text-slate-900">Contester cette réservation</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        {perspective === "client"
          ? "À n'utiliser que si la prestation ne s'est pas passée comme convenu et que vous n'arrivez pas à vous entendre. Pour une simple question, écrivez d'abord au prestataire par message : la plupart des désaccords se règlent là."
          : "À n'utiliser que si le client ne respecte pas ce qui était convenu et que vous n'arrivez pas à vous entendre. Pour une simple question, écrivez-lui d'abord par message."}
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Ce qui s&apos;est passé — 30 caractères au minimum. C&apos;est sur ce récit que nous
          trancherons, et l&apos;autre partie en recevra sa version à écrire.
        </span>
        <Textarea
          name="reason"
          rows={4}
          minLength={30}
          placeholder="Les faits, les dates, les sommes. Évitez les jugements : ce sont les faits qui nous permettront de trancher."
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Ouvrir le litige
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
        <p role="alert" className="mt-2 text-xs leading-relaxed text-slate-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
