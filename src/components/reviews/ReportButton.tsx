"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Flag, Loader2, X } from "lucide-react";

import { reportContent, type ReportState } from "@/app/(marketplace)/actions-signalement";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MIN } from "@/lib/validation/review";

/**
 * Signaler un avis ou une annonce.
 *
 * **Discret, et c'est voulu.** Un bouton « Signaler » aussi visible que la note
 * invite à s'en servir comme d'un bouton « je ne suis pas d'accord ». Il est
 * donc en petit, replié, et le formulaire demande un motif écrit : trois
 * frictions qui ne gênent personne d'honnête et découragent le reste.
 *
 * **Un visiteur non connecté est renvoyé à la connexion, pas refusé.** La base
 * refuserait de toute façon ; un message d'erreur après avoir écrit un motif
 * serait la pire façon de l'apprendre. Même traitement que le cœur des favoris.
 */
export function ReportButton({
  genre,
  cible,
  signedIn,
  label = "Signaler",
}: {
  genre: "review" | "listing";
  cible: string;
  signedIn: boolean;
  label?: string;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [state, action, pending] = React.useActionState<ReportState, FormData>(
    reportContent,
    {},
  );

  if (state.ok) {
    return (
      <p
        role="status"
        className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-teal-800"
      >
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href="/connexion"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-all duration-200 hover:text-slate-700"
      >
        <Flag className="h-3 w-3" aria-hidden />
        {label} (connexion requise)
      </Link>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-all duration-200 hover:text-slate-700"
      >
        <Flag className="h-3 w-3" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="genre" value={genre} />
      <input type="hidden" name="cible" value={cible} />

      <p className="text-xs font-bold text-slate-900">
        {genre === "review" ? "Signaler cet avis" : "Signaler cette annonce"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {genre === "review"
          ? "Dites ce qui pose problème : propos injurieux, contenu sans rapport, tentative de chantage. Un avis sévère mais sincère n'est pas un abus."
          : "Dites ce qui pose problème : photos qui ne correspondent pas, prestation inexistante, contenu interdit. L'annonce reste en ligne jusqu'à l'examen."}
      </p>

      <label className="mt-2 block">
        <span className="sr-only">Motif du signalement</span>
        <Textarea
          name="reason"
          rows={2}
          minLength={REASON_MIN}
          placeholder={`Au moins ${REASON_MIN} caractères`}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Envoyer
        </Button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Annuler
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
