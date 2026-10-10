"use client";

import * as React from "react";
import { Check, EyeOff, Flag, Loader2, ShieldAlert } from "lucide-react";

import {
  dismissReport,
  upholdReport,
  type ReportState,
} from "@/app/(admin)/admin/(dashboard)/signalements/actions";
import { RatingStars } from "@/components/reviews/RatingStars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AdminReport } from "@/lib/reviews";
import { REASON_MIN } from "@/lib/validation/review";

/**
 * Un signalement à trancher.
 *
 * **Un seul formulaire, deux boutons.** La décision s'écrit une fois ; c'est le
 * bouton qui dit dans quel sens elle va. Deux formulaires séparés auraient
 * demandé de recopier le motif pour changer d'avis.
 *
 * L'écran dit **pourquoi** l'avis est encore en ligne, ou non : le retrait
 * automatique n'opère que si le signaleur appartient à l'organisation visée.
 * Sans cette phrase, un administrateur croirait à un défaut.
 */
export function ReportCard({ report }: { report: AdminReport }) {
  // ⚠️ **Le sens de la décision voyage par le bouton lui-même**, jamais par un
  // champ caché qu'un `onClick` modifierait. Un bouton de soumission transmet
  // son `name` et sa `value` : il n'y a donc aucun état, donc aucune course
  // entre le rendu et la sérialisation. C'est le défaut du cœur des favoris
  // (§6 du guide), et `tests/formulaires-server-actions.test.ts` le garde.
  const [state, action, pending] = React.useActionState<ReportState, FormData>(
    async (previous, formData) =>
      formData.get("sens") === "upheld"
        ? upholdReport(previous, formData)
        : dismissReport(previous, formData),
    {},
  );

  const surAvis = report.targetType === "review";

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
            <Flag className="h-4 w-4 text-orange-500" aria-hidden />
            {surAvis ? "Avis signalé" : "Annonce signalée"}
            <span className="font-mono text-xs font-medium text-slate-400">
              {report.reference}
            </span>
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {report.orgName ?? "Partenaire inconnu"}
            {report.listingTitle ? ` · ${report.listingTitle}` : ""}
          </p>
        </div>
        <time dateTime={report.createdAt} className="text-xs text-slate-400">
          {new Date(report.createdAt).toLocaleDateString("fr-FR")}
        </time>
      </div>

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
        <span className="font-bold text-slate-900">Motif invoqué : </span>
        {report.reason}
      </p>

      <p className="mt-2 text-xs text-slate-500">
        Signalé par {report.reporterLabel}
        {report.reporterIsParty ? " — partie concernée" : " — tiers"}
      </p>

      {surAvis ? (
        <>
          <div className="mt-3 rounded-xl border border-slate-100 p-3">
            <p className="flex items-center gap-2">
              <RatingStars rating={report.reviewRating} size="sm" />
              <span className="text-sm font-bold text-slate-900">{report.reviewAuthor}</span>
            </p>
            {report.reviewBody ? (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {report.reviewBody}
              </p>
            ) : (
              <p className="mt-1.5 text-sm italic text-slate-400">Note sans commentaire.</p>
            )}
          </div>

          {/* Dit pourquoi l'avis est retiré, ou pourquoi il ne l'est pas. Sans
              cette phrase, l'écran paraîtrait incohérent d'une ligne à l'autre. */}
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            {report.reviewHiddenAt ? (
              <>
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                Retiré du public depuis le signalement : il ne compte plus dans la note du
                prestataire tant que vous n&apos;avez pas tranché.
              </>
            ) : (
              <>
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                {report.reporterIsParty
                  ? "Toujours en ligne : cet avis a déjà été rétabli une fois, il est désormais immunisé contre les signalements."
                  : "Toujours en ligne : le retrait automatique ne joue que pour une partie concernée, afin qu'un concurrent ne puisse pas éteindre les avis d'un rival."}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          Une annonce validée n&apos;est jamais retirée automatiquement : cela couperait les
          réservations d&apos;un partenaire sur la parole d&apos;un inconnu. Pour la retirer,
          passez par <span className="font-semibold">Annonces à valider</span>.
        </p>
      )}

      <form action={action} className="mt-4 border-t border-slate-100 pt-4">
        <input type="hidden" name="reportId" value={report.id} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Votre décision ({REASON_MIN} caractères au minimum — elle est consignée au
            journal, et opposable)
          </span>
          <Textarea
            name="note"
            rows={2}
            placeholder="Ex. propos injurieux confirmés / avis sévère mais légitime"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            name="sens"
            value="upheld"
            size="sm"
            variant="destructive"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Retenir le signalement
          </Button>

          <Button type="submit" name="sens" value="dismissed" size="sm" variant="ghost" disabled={pending}>
            Écarter{surAvis ? " et rétablir" : ""}
          </Button>
        </div>

        {surAvis ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Écarter rétablit l&apos;avis <strong>définitivement</strong> : aucun nouveau
            signalement ne pourra plus le masquer. Seule l&apos;équipe pourra encore le
            retirer, depuis <span className="font-semibold">Avis</span>.
          </p>
        ) : null}

        {state.error ? (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </article>
  );
}
