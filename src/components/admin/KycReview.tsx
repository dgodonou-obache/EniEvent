"use client";

import * as React from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from "lucide-react";

import {
  reviewDocument,
  signKycDocument,
  type ReviewState,
} from "@/app/(admin)/admin/(dashboard)/documents/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { KycDossier, KycPiece } from "@/lib/admin";
import { KYC_STATUS_LABELS } from "@/lib/kyc";
import { KYC_TYPE_LABELS } from "@/lib/validation/partner";

/**
 * Le dossier d'un partenaire, et la décision qui va avec.
 *
 * ⚠️ **Cet écran n'existait pas.** Le back-office annonçait « Dossiers KYC à
 * vérifier » et renvoyait vers l'écran des commissions : on ne voyait aucun
 * document. Côté base, tout était là depuis la migration 0002 — pièces, états,
 * motif de refus, droit de trancher réservé à l'administration — et personne ne
 * pouvait le regarder. Un partenaire qui déposait lisait « En cours de
 * vérification » indéfiniment.
 *
 * Ce que l'écran montre en premier n'est pas la liste des pièces reçues mais
 * **ce qui manque** : c'est la seule chose qui appelle une action, et c'est
 * aussi ce qu'il faut dire au partenaire quand on le relance.
 */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function jour(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : JOUR.format(d);
}

const TONS: Record<string, string> = {
  pending: "bg-orange-50 text-orange-600",
  approved: "bg-teal-50 text-teal-700",
  rejected: "bg-red-50 text-red-700",
};

export function KycReview({ dossiers }: { dossiers: KycDossier[] }) {
  if (dossiers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
        Aucun partenaire inscrit pour l&apos;instant.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {dossiers.map((dossier) => (
        <li key={dossier.orgId}>
          <Dossier dossier={dossier} />
        </li>
      ))}
    </ul>
  );
}

function Dossier({ dossier }: { dossier: KycDossier }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            {dossier.name}
            {dossier.verified ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            ) : null}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {dossier.city ?? "Ville non précisée"} · {dossier.pieces.length} pièce
            {dossier.pieces.length > 1 ? "s" : ""} déposée{dossier.pieces.length > 1 ? "s" : ""}
          </p>
        </div>

        {/* ⚠️ **La pastille dit l'état du _dossier_, la coche dit l'état du
            _badge_.** Les confondre faisait afficher « Dossier validé » juste
            au-dessus de « Il manque : … » sur les six structures de
            démonstration, dont le badge vient du *seed* et non d'une pièce. Ce
            sont deux faits distincts, et c'est justement leur écart qu'un
            exploitant doit pouvoir voir. */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-wider ${
            dossier.missing.length === 0 ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {dossier.missing.length === 0 ? "Dossier complet" : "Dossier incomplet"}
        </span>
      </header>

      {/* L'écart entre les deux : un badge actif que rien ne soutient. Le dire
          plutôt que de le masquer — c'est l'état exact des six structures de
          démonstration, et il doit rester visible jusqu'à leur retrait. */}
      {dossier.verified && dossier.missing.length > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Badge « vérifié » actif sans dossier complet.</span>{" "}
            {dossier.missing.length} pièce{dossier.missing.length > 1 ? "s" : ""} n&apos;
            {dossier.missing.length > 1 ? "ont" : "a"} jamais été validée
            {dossier.missing.length > 1 ? "s" : ""}. Trancher une pièce de cette structure
            recalculera le badge à partir des pièces réelles.
          </span>
        </p>
      ) : null}

      {/* ⚠️ Ce qui manque passe **avant** ce qui a été reçu : c'est la seule
          ligne qui appelle une action, et celle qu'on dicte au téléphone. */}
      {!dossier.verified && dossier.missing.length > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
          <span>
            <span className="font-semibold">Il manque : </span>
            {dossier.missing.map((t) => KYC_TYPE_LABELS[t] ?? t).join(", ")}.
            {dossier.listingsWaiting > 0 ? (
              <span className="mt-1 block text-slate-600">
                {dossier.listingsWaiting} annonce{dossier.listingsWaiting > 1 ? "s" : ""} attend
                {dossier.listingsWaiting > 1 ? "ent" : ""} en modération — elle
                {dossier.listingsWaiting > 1 ? "s ne pourront" : " ne pourra"} être mise
                {dossier.listingsWaiting > 1 ? "s" : ""} en ligne qu&apos;une fois ce dossier
                validé.
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      {dossier.pieces.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Cette structure n&apos;a encore rien déposé.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {dossier.pieces.map((piece) => (
            <li key={piece.id}>
              <Piece piece={piece} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Piece({ piece }: { piece: KycPiece }) {
  const [ouverture, ouvrir, enOuverture] = React.useActionState<ReviewState, FormData>(
    signKycDocument,
    {},
  );
  const [decision, trancher, enDecision] = React.useActionState<ReviewState, FormData>(
    reviewDocument,
    {},
  );
  const [refus, setRefus] = React.useState(false);

  // Le document s'ouvre dans un onglet dès que l'adresse signée revient. Dans
  // un effet, jamais pendant le rendu : une ouverture est une conséquence.
  React.useEffect(() => {
    if (ouverture.url) window.open(ouverture.url, "_blank", "noopener,noreferrer");
  }, [ouverture.url]);

  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{KYC_TYPE_LABELS[piece.type] ?? piece.type}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider ${
              TONS[piece.status] ?? "bg-slate-100 text-slate-500"
            }`}
          >
            {KYC_STATUS_LABELS[piece.status]}
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Déposée le {jour(piece.createdAt)}</span>

          <form action={ouvrir}>
            <input type="hidden" name="documentId" value={piece.id} />
            <button
              type="submit"
              disabled={enOuverture}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.97] disabled:opacity-50"
            >
              {enOuverture ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              )}
              Ouvrir
            </button>
          </form>
        </span>
      </div>

      {piece.status === "rejected" && piece.rejectionReason ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-relaxed text-red-900">
          <span className="font-bold">Motif transmis : </span>
          {piece.rejectionReason}
        </p>
      ) : null}

      {ouverture.error ? (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-red-700">
          {ouverture.error}
        </p>
      ) : null}

      {/* Une pièce déjà tranchée garde ses boutons : une décision se corrige,
          et c'est précisément ce qui éteint ou rallume le badge. */}
      <form action={trancher} className="mt-3">
        <input type="hidden" name="documentId" value={piece.id} />

        {refus ? (
          <div className="space-y-2">
            <Textarea
              name="motif"
              rows={2}
              required
              placeholder="Ce qui ne va pas — le partenaire lira ce texte sur son espace."
              className="text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {/* ⚠️ La décision voyage sur le **bouton**, qui porte son propre
                  name/value. Un champ caché que le clic met à jour vaudrait
                  l'inverse à la sérialisation (`CLAUDE.md` §6). */}
              <Button
                type="submit"
                name="decision"
                value="rejected"
                variant="outline"
                size="sm"
                disabled={enDecision}
              >
                {enDecision ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Confirmer le refus
              </Button>
              <button
                type="button"
                onClick={() => setRefus(false)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="decision"
              value="approved"
              size="sm"
              disabled={enDecision || piece.status === "approved"}
            >
              {enDecision ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {piece.status === "approved" ? "Validée" : "Valider"}
            </Button>

            <button
              type="button"
              onClick={() => setRefus(true)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:scale-[0.97]"
            >
              Refuser
            </button>
          </div>
        )}

        {decision.message ? (
          <p role="status" className="mt-2 text-xs font-medium text-teal-700">
            {decision.message}
          </p>
        ) : null}
        {decision.error ? (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            {decision.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
