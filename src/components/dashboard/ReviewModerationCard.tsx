"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react";

import {
  redactReviewBody,
  restoreReviewBody,
  type ModerationState,
} from "@/app/(admin)/admin/(dashboard)/avis/actions";
import { RatingStars } from "@/components/reviews/RatingStars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AdminReview } from "@/lib/reviews";
import { REASON_MIN } from "@/lib/validation/review";

/**
 * Un avis, et le seul geste de modération qui subsiste.
 *
 * ⚠️ **Il n'y a plus de bouton pour retirer un avis**, et c'est le cœur de la
 * décision du 11 octobre 2026. Ce qui reste ne retire que le **texte**, pour un
 * contenu illicite, et l'écran le dit avant le clic : la note continue de
 * compter, et l'avis reste affiché avec le motif à la place du commentaire.
 *
 * Le motif est **public** — il s'affiche sous l'avis, chez le client comme chez
 * le partenaire. C'est ce qui sépare une modération assumée d'un effacement, et
 * c'est pourquoi le champ demande une phrase lisible plutôt qu'un code.
 */
export function ReviewModerationCard({ review }: { review: AdminReview }) {
  const retire = review.bodyRedactedAt !== null;

  return (
    <article
      className={`rounded-2xl border p-4 ${
        retire ? "border-slate-200 bg-slate-50/70" : "border-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <RatingStars rating={review.rating} size="sm" />
            <span className="text-sm font-bold text-slate-900">{review.authorLabel}</span>
            {retire ? (
              <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <ShieldAlert className="h-3 w-3" aria-hidden />
                Commentaire retiré
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

      {/* Le texte d'origine reste lisible par l'équipe même après retrait :
          c'est ce qu'on relira si l'auteur réclame. */}
      {review.body ? (
        <p
          className={`mt-2 whitespace-pre-line text-sm leading-relaxed ${
            retire ? "text-slate-400 line-through decoration-slate-300" : "text-slate-700"
          }`}
        >
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

      {retire ? (
        <>
          {review.redactionReason ? (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
              <span className="font-bold text-slate-900">Publié à la place du texte : </span>
              {review.redactionReason}
            </p>
          ) : null}
          <Restore reviewId={review.id} />
        </>
      ) : (
        <Redact reviewId={review.id} rating={review.rating} />
      )}
    </article>
  );
}

function Redact({ reviewId, rating }: { reviewId: string; rating: number }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<ModerationState, FormData>(
    redactReviewBody,
    {},
  );

  if (state.message) return <Resultat message={state.message} />;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
      >
        Retirer le commentaire
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <input type="hidden" name="reviewId" value={reviewId} />

      <p className="flex items-start gap-2 text-sm font-bold text-slate-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
        Retirer le texte de cet avis ?
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-700">
        <strong>La note de {rating}/5 restera comptée</strong> et l&apos;avis restera affiché :
        seul le commentaire disparaît, remplacé par votre motif. Réservé à un{" "}
        <strong>contenu illicite</strong> — insulte nominative, coordonnées, données
        personnelles. Jamais parce qu&apos;un avis est sévère : le prestataire a un droit de
        réponse pour cela. Le geste est journalisé.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Motif, <strong>publié sous l&apos;avis</strong> ({REASON_MIN} caractères au
          minimum) — écrivez-le pour le lecteur, pas pour le dossier
        </span>
        <Textarea
          name="reason"
          rows={2}
          placeholder="Ex. propos injurieux envers un salarié nommément désigné"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Retirer le commentaire
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

function Restore({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = React.useActionState<ModerationState, FormData>(
    restoreReviewBody,
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
        Rétablir le commentaire
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
