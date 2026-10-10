"use client";

import * as React from "react";
import { Check, Loader2, Star, X } from "lucide-react";

import { submitReview, type ReviewState } from "@/app/(account)/compte/reservations/review-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { cn } from "@/lib/utils";
import type { ReviewView } from "@/lib/reviews";
import { REVIEW_BODY_MAX } from "@/lib/validation/review";

import { RatingStars } from "./RatingStars";

/**
 * Donner son avis sur une prestation passée.
 *
 * **La note se choisit d'abord, le texte ensuite et seulement si on veut.**
 * Exiger un commentaire ferait taire les clients satisfaits, qui n'ont souvent
 * rien de particulier à dire — et ce sont eux qu'on perd le plus facilement.
 *
 * ⚠️ **Le champ caché `rating` ne porte pas une valeur que le clic modifie.**
 * Les étoiles écrivent dans un état React, et le champ caché lit cet état :
 * au moment où le navigateur sérialise le formulaire, le rendu a déjà eu lieu.
 * C'est le piège du cœur des favoris (§6 du guide), à ceci près qu'ici l'état
 * d'arrivée **ne dépend pas de l'état de départ** — une note est une sélection,
 * comme les dates de `BookingBox`, et la porter dans le formulaire est
 * légitime.
 */

const LIBELLES = [
  "",
  "Très décevant",
  "Décevant",
  "Correct",
  "Très bien",
  "Parfait",
] as const;

export function ReviewForm({
  orderId,
  existing,
  listingTitle,
}: {
  orderId: string;
  /** L'avis déjà déposé, s'il y en a un. */
  existing: ReviewView | null;
  listingTitle: string | null;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [note, setNote] = React.useState(existing?.rating ?? 0);
  const [state, action, pending] = React.useActionState<ReviewState, FormData>(submitReview, {});
  const formRef = useFieldErrors(state.errors);

  // Un avis déjà déposé se relit, avec la réponse du prestataire s'il y en a
  // une. Le modifier n'est possible que tant que personne n'a répondu — la base
  // le refuse ensuite, et l'écran ne propose donc pas ce qu'elle refusera.
  if (existing && !state.ok) {
    return (
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <RatingStars rating={existing.rating} size="sm" />
          <span className="font-bold text-slate-900">Votre avis est publié</span>
        </p>
        {existing.body ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {existing.body}
          </p>
        ) : null}
        {existing.reply ? (
          <div className="mt-3 rounded-lg border-l-2 border-orange-200 bg-white px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
              Réponse du prestataire
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {existing.reply}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

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
        <Star className="h-3.5 w-3.5" aria-hidden />
        Donner mon avis
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="rating" value={note || ""} />

      <p className="text-sm font-bold text-slate-900">
        Votre avis{listingTitle ? ` sur ${listingTitle}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Il sera publié sous votre prénom et l&apos;initiale de votre nom. Le prestataire
        pourra y répondre une fois.
      </p>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium text-slate-500">Votre note</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((valeur) => (
            <button
              key={valeur}
              type="button"
              onClick={() => setNote(valeur)}
              aria-pressed={note === valeur}
              aria-label={`${valeur} sur 5 — ${LIBELLES[valeur]}`}
              className="rounded-lg p-1 transition-all duration-200 hover:bg-orange-100 active:scale-[0.97]"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-all duration-200",
                  valeur <= note ? "fill-orange-400 text-orange-400" : "text-slate-300",
                )}
                aria-hidden
              />
            </button>
          ))}
          {note > 0 ? (
            <span className="ml-2 text-sm font-semibold text-slate-700">{LIBELLES[note]}</span>
          ) : null}
        </div>
        {state.errors?.rating ? (
          <p role="alert" className="mt-1 text-xs font-medium text-red-600">
            {state.errors.rating}
          </p>
        ) : null}
      </fieldset>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Votre commentaire (facultatif)
        </span>
        <Textarea
          name="body"
          rows={3}
          maxLength={REVIEW_BODY_MAX}
          placeholder="Ce qui s'est bien passé, ce qui pourrait être amélioré…"
        />
        {state.errors?.body ? (
          <span role="alert" className="mt-1 block text-xs font-medium text-red-600">
            {state.errors.body}
          </span>
        ) : null}
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Publier mon avis
        </Button>

        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Plus tard
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
