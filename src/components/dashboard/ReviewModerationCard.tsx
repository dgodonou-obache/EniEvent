"use client";

import * as React from "react";
import { AlertTriangle, Check, EyeOff, Loader2, RotateCcw, X } from "lucide-react";

import {
  hideReview,
  reinstateReview,
  type ModerationState,
} from "@/app/(admin)/admin/(dashboard)/avis/actions";
import { RatingStars } from "@/components/reviews/RatingStars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AdminReview } from "@/lib/reviews";
import { REASON_MIN } from "@/lib/validation/review";

/**
 * Un avis en modération.
 *
 * **Deux gestes pour retirer, un seul pour rétablir.** Retirer une parole
 * demande un motif écrit, qu'on relira si l'auteur réclame ; rétablir ne
 * supprime rien et se corrige en reprenant le premier geste.
 *
 * Le motif de modération déjà posé est affiché : c'est tout l'intérêt de
 * l'avoir exigé, et sans lui l'écran ne dirait pas pourquoi cet avis est
 * masqué. Il vient de `admin_reviews()`, seule lecture possible — la colonne
 * est hors du `grant select`, et un administrateur est lui aussi
 * `authenticated`.
 */
export function ReviewModerationCard({ review }: { review: AdminReview }) {
  const masque = review.hiddenAt !== null;

  return (
    <article
      className={`rounded-2xl border p-4 ${
        masque ? "border-slate-200 bg-slate-50/70" : "border-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <RatingStars rating={review.rating} size="sm" />
            <span className="text-sm font-bold text-slate-900">{review.authorLabel}</span>
            {masque ? (
              <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <EyeOff className="h-3 w-3" aria-hidden />
                Retiré
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {review.orgName} · {review.listingTitle ?? "Prestation sur devis"} ·{" "}
            {review.orderReference}
          </p>
        </div>
        <time dateTime={review.createdAt} className="text-xs text-slate-400">
          {new Date(review.createdAt).toLocaleDateString("fr-FR")}
        </time>
      </div>

      {review.body ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {review.body}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-slate-400">Note sans commentaire.</p>
      )}

      {review.reply ? (
        <div className="mt-3 rounded-xl border-l-2 border-orange-200 bg-orange-50/50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
            Réponse du prestataire
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {review.reply}
          </p>
        </div>
      ) : null}

      {masque ? (
        <>
          {review.hiddenReason ? (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
              <span className="font-bold text-slate-900">Motif du retrait : </span>
              {review.hiddenReason}
            </p>
          ) : null}
          <Reinstate reviewId={review.id} />
        </>
      ) : (
        <Hide reviewId={review.id} />
      )}
    </article>
  );
}

function Hide({ reviewId }: { reviewId: string }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<ModerationState, FormData>(hideReview, {});

  if (state.message) return <Resultat message={state.message} />;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
      >
        Retirer cet avis
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <input type="hidden" name="reviewId" value={reviewId} />

      <p className="flex items-start gap-2 text-sm font-bold text-slate-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
        Retirer cet avis du public ?
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-700">
        Il sortira de la note du prestataire et du catalogue, mais restera lisible par son
        auteur et par le prestataire : on ne supprime pas une parole sans que son auteur
        puisse la relire. Le geste est journalisé.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Motif ({REASON_MIN} caractères au minimum — c&apos;est lui qu&apos;on relira si
          l&apos;auteur réclame)
        </span>
        <Textarea name="reason" rows={2} placeholder="Ex. propos injurieux envers le personnel" />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Confirmer le retrait
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

      {state.error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Reinstate({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = React.useActionState<ModerationState, FormData>(
    reinstateReview,
    {},
  );

  if (state.message) return <Resultat message={state.message} />;

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        )}
        Rétablir cet avis
      </Button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Resultat({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900"
    >
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
