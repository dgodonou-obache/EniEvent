import Link from "next/link";
import { EyeOff, Star } from "lucide-react";

import { RatingStars, formatRating } from "@/components/reviews/RatingStars";
import { ReplyForm } from "@/components/reviews/ReplyForm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getPartnerReviews } from "@/lib/reviews";
import { RATING_RANK_MIN } from "@/lib/validation/review";

/**
 * Les avis reçus par un partenaire.
 *
 * Ce qu'il vient chercher ici tient en une question : **à quoi dois-je
 * répondre ?** Les avis sans réponse passent donc devant, les plus anciens en
 * tête — un avis sévère resté sans réponse pendant deux mois coûte plus cher
 * que l'avis lui-même.
 *
 * Les avis masqués par la modération figurent dans la liste, **sans leur
 * motif** : le prestataire a le droit de savoir ce qui a été dit de lui et
 * qu'un signalement a été retenu, mais un motif de modération cite souvent
 * celui qui a signalé.
 *
 * ⚠️ **Pas de note moyenne calculée ici.** Elle vit dans `partner_profiles`,
 * recalculée par déclencheur sur les avis non masqués : la recalculer à
 * l'écran ferait deux vérités, et c'est celle de l'écran qui finirait par
 * divorcer du classement.
 */

export const metadata = { title: "Avis reçus" };

export default async function PartnerReviewsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const avis = await getPartnerReviews(decision.org.orgId);

  const visibles = avis.filter((a) => a.hiddenAt === null);
  const aRepondre = visibles.filter((a) => a.reply === null);
  const traites = avis.filter((a) => a.hiddenAt !== null || a.reply !== null);

  // Même calcul que la base, sur les mêmes lignes : les avis masqués sortent
  // de la moyenne. Affiché seulement pour que le partenaire lise la même chose
  // que son client.
  const moyenne =
    visibles.length > 0
      ? visibles.reduce((total, a) => total + a.rating, 0) / visibles.length
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Avis reçus</h1>
        {visibles.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Aucun avis pour l&apos;instant.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <RatingStars rating={moyenne} />
              <span className="font-bold text-slate-900">{formatRating(moyenne)}</span>
            </span>
            <span className="text-sm text-slate-500">
              sur {visibles.length} avis
              {aRepondre.length > 0
                ? ` · ${aRepondre.length} sans réponse`
                : " · tous traités"}
            </span>
          </div>
        )}
      </div>

      {avis.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Aucun avis pour l'instant"
          description="Un avis ne peut être écrit que par un client qui a réservé chez vous, réglé sa prestation, et dont la date est passée. C'est ce qui garantit à vos futurs clients qu'aucun n'est fabriqué — et à vous qu'aucun concurrent ne peut vous noter."
          action={
            <Link href="/pro/annonces">
              <Button>Voir mes annonces</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {aRepondre.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">À répondre</h2>
              <p className="mb-3 text-sm text-slate-500">
                Les plus anciens d&apos;abord. Votre réponse s&apos;affiche sous l&apos;avis,
                et c&apos;est souvent elle, plus que la note, que lisent les clients
                suivants.
              </p>
              <ul className="space-y-4">
                {[...aRepondre]
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((a) => (
                    <li key={a.id}>
                      <ReviewCard review={a} />
                      <ReplyForm reviewId={a.id} rating={a.rating} />
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {traites.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Déjà traités</h2>
              <ul className="space-y-4">
                {traites.map((a) => (
                  <li key={a.id}>
                    <ReviewCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibles.length > 0 && visibles.length < RATING_RANK_MIN ? (
            <p className="rounded-2xl border border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500">
              Votre note est affichée sur vos annonces mais ne compte pas encore dans le
              classement des résultats, qui attend {RATING_RANK_MIN} avis. Ce seuil protège
              aussi bien : un unique avis sévère ne vous fait pas reculer non plus.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
}: {
  review: Awaited<ReturnType<typeof getPartnerReviews>>[number];
}) {
  const masque = review.hiddenAt !== null;

  return (
    <article
      className={`rounded-2xl border p-4 transition-all duration-300 ${
        masque ? "border-slate-100 bg-slate-50/60" : "border-slate-100 hover:border-orange-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RatingStars rating={review.rating} size="sm" />
          <span className="truncate text-sm font-bold text-slate-900">{review.authorLabel}</span>
        </div>
        <time dateTime={review.createdAt} className="text-xs text-slate-400">
          {new Date(review.createdAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </time>
      </div>

      <p className="mt-1 text-xs text-slate-400">
        {review.listingTitle ?? "Prestation sur devis"}
        {review.orderReference ? ` · ${review.orderReference}` : ""}
      </p>

      {masque ? (
        // Le motif n'est pas affiché : il cite souvent celui qui a signalé.
        // Hors du `grant select`, il ne sort d'ailleurs pas de la base.
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Cet avis a été retiré par l&apos;équipe ÉniEvent après examen. Il ne compte plus
          dans votre note et n&apos;est plus visible du public.
        </p>
      ) : null}

      {review.body ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {review.body}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-slate-400">Note sans commentaire.</p>
      )}

      {review.reply ? (
        <div className="mt-3 rounded-xl border-l-2 border-orange-200 bg-orange-50/50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
            Votre réponse
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {review.reply}
          </p>
        </div>
      ) : null}
    </article>
  );
}
