import { MessageSquareQuote, Star } from "lucide-react";

import type { ReviewView } from "@/lib/reviews";
import { RATING_RANK_MIN } from "@/lib/validation/review";

import { RatingStars, formatRating } from "./RatingStars";

/**
 * Les avis d'une annonce, sur sa fiche publique.
 *
 * Deux choix d'affichage qui ne vont pas de soi :
 *
 * 1. **L'état vide est soigné**, parce que c'est l'état du jour : aucune
 *    prestation n'a encore été réalisée sur la plateforme. Il dit *pourquoi*
 *    il n'y a rien — seul un client ayant réellement réservé peut écrire ici —
 *    ce qui vaut mieux qu'un silence : un visiteur qui ne voit aucun avis
 *    soupçonne qu'ils sont cachés.
 *
 * 2. **La réponse du prestataire est en retrait sous l'avis**, jamais à côté.
 *    Elle répond à ce texte-là et à aucun autre ; la mettre au même niveau
 *    laisserait croire à deux opinions concurrentes.
 *
 * Le texte est interpolé en JSX avec `whitespace-pre-line`, comme
 * `quotes.message`. **Jamais** de `dangerouslySetInnerHTML` : un avis est du
 * texte saisi par un inconnu.
 */
export function ReviewList({
  reviews,
  ratingAvg,
  ratingCount,
}: {
  reviews: ReviewView[];
  ratingAvg: number | null;
  ratingCount: number | null;
}) {
  const nombre = ratingCount ?? 0;

  if (nombre === 0 || reviews.length === 0) {
    return (
      <section id="avis">
        <h2 className="text-lg font-bold text-slate-900">Avis</h2>
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
            <Star className="h-5 w-5 text-slate-400" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-900">Pas encore d&apos;avis</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Seul un client qui a réservé ici et réglé sa prestation peut en écrire un.
            C&apos;est pour cela qu&apos;il n&apos;y en a aucun de complaisance.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="avis">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-slate-900">Avis</h2>
        <span className="flex items-center gap-1.5">
          <RatingStars rating={ratingAvg} />
          <span className="text-sm font-bold text-slate-900">{formatRating(ratingAvg)}</span>
          <span className="text-sm text-slate-500">· {nombre} avis</span>
        </span>
      </div>

      {/* ⚠️ Dit à l'écran ce que fait réellement la base : en dessous du seuil,
          `listing_search.rating_sort` est nulle et l'annonce garde son rang.
          Une note affichée qui ne classe pas doit s'expliquer, sinon le
          partenaire croira à un bug — et le client à une note truquée. */}
      {nombre < RATING_RANK_MIN ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Cette note repose sur {nombre} avis : elle est affichée mais ne compte pas encore
          dans le classement des résultats, qui attend {RATING_RANK_MIN} avis.
        </p>
      ) : null}

      <ul className="mt-5 space-y-4">
        {reviews.map((avis) => (
          <li
            key={avis.id}
            className="rounded-2xl border border-slate-100 p-4 transition-all duration-300 hover:border-orange-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RatingStars rating={avis.rating} size="sm" />
                <span className="text-sm font-bold text-slate-900">{avis.authorLabel}</span>
              </div>
              <time dateTime={avis.createdAt} className="text-xs text-slate-400">
                {mois(avis.createdAt)}
              </time>
            </div>

            {avis.body ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {avis.body}
              </p>
            ) : (
              <p className="mt-2 text-sm italic text-slate-400">Note sans commentaire.</p>
            )}

            {avis.reply ? (
              <div className="mt-3 rounded-xl border-l-2 border-orange-200 bg-orange-50/50 px-4 py-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
                  <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
                  Réponse du prestataire
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {avis.reply}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * « octobre 2026 ».
 *
 * Le jour exact n'apporte rien et resserre l'avis sur une date précise, donc
 * sur une prestation identifiable — le mois suffit à situer sa fraîcheur.
 */
function mois(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
