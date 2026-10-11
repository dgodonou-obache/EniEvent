import Link from "next/link";
import { ShieldAlert, Star } from "lucide-react";

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
 * ⚠️ **Aucun avis ne se retire, et cet écran est donc construit autour d'une
 * seule question : à quoi dois-je répondre ?** La décision d'exploitation du
 * 11 octobre 2026 a supprimé le retrait sur signalement — un avis qui disparaît
 * se lit comme un avis étouffé, et c'est la plateforme qui en paie le prix.
 * La réponse publique est le recours, et c'est elle que l'écran met devant.
 *
 * Les avis sans réponse passent donc en premier, les plus anciens en tête : un
 * avis sévère resté deux mois sans réponse coûte plus cher que l'avis lui-même,
 * parce que le silence se lit comme un aveu.
 *
 * ⚠️ **Pas de note moyenne calculée ici.** Elle vit dans `partner_profiles`,
 * recalculée par déclencheur sur **tous** les avis : la recalculer à l'écran
 * ferait deux vérités, et c'est celle de l'écran qui finirait par divorcer du
 * classement.
 */

export const metadata = { title: "Avis reçus" };

export default async function PartnerReviewsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const avis = await getPartnerReviews(decision.org.orgId);

  const aRepondre = avis.filter((a) => a.reply === null);
  const repondus = avis.filter((a) => a.reply !== null);
  const severes = avis.filter((a) => a.rating <= 2);

  // Même calcul que la base, sur les mêmes lignes — c'est-à-dire sur toutes.
  // Affiché pour que le partenaire lise exactement ce que lit son client.
  const moyenne =
    avis.length > 0 ? avis.reduce((total, a) => total + a.rating, 0) / avis.length : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Avis reçus</h1>
        {avis.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Aucun avis pour l&apos;instant.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <RatingStars rating={moyenne} />
              <span className="font-bold text-slate-900">{formatRating(moyenne)}</span>
            </span>
            <span className="text-sm text-slate-500">
              sur {avis.length} avis
              {aRepondre.length > 0 ? ` · ${aRepondre.length} sans réponse` : " · tous répondus"}
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
          {/* La règle, dite une fois et en haut. Un partenaire qui découvre un
              1/5 cherche d'abord comment le faire enlever : autant qu'il
              trouve immédiatement ce qu'il peut faire à la place. */}
          {severes.length > 0 ? (
            <p className="flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>
                <strong>Un avis ne se retire pas</strong>, même sévère, même contesté — une
                vitrine qui n&apos;affiche que des éloges ne rassure personne. Ce que vous
                pouvez faire, et qui pèse souvent plus que l&apos;avis : y{" "}
                <strong>répondre publiquement</strong>. Une réponse posée se lit par tous les
                clients suivants.
              </span>
            </p>
          ) : null}

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

          {repondus.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Répondus</h2>
              <ul className="space-y-4">
                {repondus.map((a) => (
                  <li key={a.id}>
                    <ReviewCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {avis.length < RATING_RANK_MIN ? (
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
  return (
    <article className="rounded-2xl border border-slate-100 p-4 transition-all duration-300 hover:border-orange-200">
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

      {/* Le partenaire lit exactement ce que lit son client : le motif est
          public, et le lui cacher n'aurait servi à rien. */}
      {review.bodyRedactedAt ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            <span className="font-semibold text-slate-900">
              Commentaire retiré par ÉniEvent
            </span>
            {review.redactionReason ? ` — ${review.redactionReason}` : null}
            <span className="mt-0.5 block text-xs text-slate-500">
              La note du client reste comptée : nous retirons un texte illicite, pas un
              jugement.
            </span>
          </span>
        </p>
      ) : review.body ? (
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
