"use client";

import * as React from "react";
import { Check, Flag, Loader2, ShieldAlert } from "lucide-react";

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

          {/* ⚠️ **Plus rien n'est retiré automatiquement**, et l'écran doit le
              dire : un administrateur qui se souvient de l'ancien comportement
              chercherait l'avis masqué. Le signalement est devenu ce qu'il
              aurait dû être — un signal, pas un bouton de suppression. */}
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {report.reviewBodyRedactedAt ? (
              <span>
                Le <strong>commentaire</strong> de cet avis a été retiré ; sa note reste
                comptée et l&apos;avis reste affiché, avec le motif à la place du texte.
              </span>
            ) : (
              <span>
                <strong>Cet avis reste en ligne</strong>, et le restera : un avis ne se
                retire pas. Si son <em>texte</em> est illicite — insulte nominative,
                coordonnées, données personnelles — retirez-le depuis{" "}
                <span className="font-semibold">Avis</span> ; la note du client continuera
                de compter. Sinon, le recours du prestataire est sa réponse publique.
              </span>
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
            Retenir — contenu problématique
          </Button>

          <Button
            type="submit"
            name="sens"
            value="dismissed"
            size="sm"
            variant="ghost"
            disabled={pending}
          >
            Écarter — rien à reprocher
          </Button>
        </div>

        {surAvis ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Les deux issues <strong>ne touchent pas à l&apos;avis</strong> : elles consignent
            votre décision, et c&apos;est tout. Retirer un commentaire illicite est un geste
            distinct, depuis <span className="font-semibold">Avis</span> — les enchaîner
            ferait du signalement un bouton de suppression.
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
