import { Star } from "lucide-react";

import { ReviewModerationCard } from "@/components/dashboard/ReviewModerationCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminReviews } from "@/lib/reviews";

/**
 * Modération des avis.
 *
 * **Les avis sont publiés immédiatement** — décision d'exploitation : une file
 * d'attente avant publication ferait d'ÉniEvent l'éditeur de chaque avis, et
 * un avis qui met trois jours à paraître n'est plus lu par personne. Le retrait
 * vient donc **après**, sur signalement ou par examen de cette page.
 *
 * Ce qui est montré d'abord : les avis **retirés**. C'est le seul groupe qui
 * demande une décision — un avis masqué par un signalement attend qu'on
 * tranche, et pendant ce temps il manque à la note du prestataire. Les avis
 * visibles sont une archive qu'on ne parcourt que sur réclamation.
 *
 * ⚠️ Lecture par `admin_reviews()` et non par requête directe : `hidden_reason`
 * est hors du `grant select`, et un administrateur est lui aussi
 * `authenticated` — un droit de colonne ne sait pas l'en distinguer.
 */

export const metadata = { title: "Avis" };

export default async function AdminReviewsPage() {
  const avis = await getAdminReviews("tous");

  const retires = avis.filter((a) => a.hiddenAt !== null);
  const visibles = avis.filter((a) => a.hiddenAt === null);
  const severes = visibles.filter((a) => a.rating <= 2);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Avis</h1>
      <p className="mt-1 text-sm text-slate-500">
        {avis.length === 0
          ? "Aucun avis déposé pour l'instant."
          : `${avis.length} avis · ${retires.length} retiré${retires.length > 1 ? "s" : ""} · ${severes.length} à deux étoiles ou moins`}
      </p>

      {avis.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Star}
            title="Aucun avis déposé"
            description="Un avis exige une réservation réglée dont la date est passée. Aucune prestation n'a encore été réalisée sur la plateforme : les premiers avis arriveront après les premières prestations, pas avant."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {retires.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Retirés</h2>
              <p className="mb-3 text-sm text-slate-500">
                Ces avis ne comptent plus dans la note de leur prestataire. Un avis masqué
                par un signalement attend votre décision : rétabli, il ne pourra plus être
                masqué par un nouveau signalement.
              </p>
              <ul className="space-y-4">
                {retires.map((a) => (
                  <li key={a.id}>
                    <ReviewModerationCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {severes.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">
                Sévères, et publiés
              </h2>
              <p className="mb-3 text-sm text-slate-500">
                Deux étoiles ou moins. Un avis sévère n&apos;est pas un avis abusif — la
                plupart sont mérités, et les retirer tromperait les clients suivants. Ils
                sont groupés ici pour être lus, pas pour être retirés.
              </p>
              <ul className="space-y-4">
                {severes.map((a) => (
                  <li key={a.id}>
                    <ReviewModerationCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Tous les avis publiés</h2>
            <ul className="space-y-4">
              {visibles.map((a) => (
                <li key={a.id}>
                  <ReviewModerationCard review={a} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
