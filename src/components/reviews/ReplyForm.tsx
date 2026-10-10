"use client";

import * as React from "react";
import { Check, Loader2, MessageSquareQuote, X } from "lucide-react";

import { replyToReview, type ReplyState } from "@/app/(partner)/pro/(dashboard)/avis/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { REVIEW_BODY_MAX } from "@/lib/validation/review";

/**
 * Répondre à un avis.
 *
 * **Une seule réponse, et l'écran le dit avant le clic.** La base le refuse
 * ensuite ; découvrir la règle sur un message d'erreur après avoir écrit trois
 * paragraphes serait la pire façon de l'apprendre. Un échange se poursuit dans
 * la messagerie — sous un avis public, le dernier mot reviendrait toujours au
 * prestataire.
 *
 * Le formulaire est replié par défaut : la plupart des avis ne demandent pas de
 * réponse, et une zone de texte ouverte sous chacun d'eux ferait lire la page
 * comme une liste de reproches à traiter.
 */
export function ReplyForm({ reviewId, rating }: { reviewId: string; rating: number }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<ReplyState, FormData>(replyToReview, {});
  const formRef = useFieldErrors(state.errors);

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
        className="mt-3 flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-semibold text-orange-600 transition-all duration-200 hover:bg-orange-50 active:scale-[0.98]"
      >
        <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
        Répondre
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4"
    >
      <input type="hidden" name="reviewId" value={reviewId} />

      <p className="text-sm font-bold text-slate-900">Votre réponse publique</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Elle s&apos;affichera sous cet avis, visible de tous.{" "}
        <strong>Vous ne pouvez répondre qu&apos;une fois</strong> : relisez-vous.
        {rating <= 2
          ? " Une réponse posée à un avis sévère convainc souvent mieux que l'avis lui-même ne dissuade."
          : ""}
      </p>

      <label className="mt-3 block">
        <span className="sr-only">Votre réponse</span>
        <Textarea
          name="reply"
          rows={4}
          maxLength={REVIEW_BODY_MAX}
          placeholder="Ce qui s'est passé de votre côté, et ce que vous proposez."
        />
        {state.errors?.reply ? (
          <span role="alert" className="mt-1 block text-xs font-medium text-red-600">
            {state.errors.reply}
          </span>
        ) : null}
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Publier ma réponse
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
