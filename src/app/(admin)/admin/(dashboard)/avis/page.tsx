import { ShieldAlert, Star } from "lucide-react";

import { ReviewModerationCard } from "@/components/dashboard/ReviewModerationCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminReviews } from "@/lib/reviews";

/**
 * Les avis, et le peu qu'on peut en faire.
 *
 * ⚠️ **Il n'y a pas de file de modération, parce qu'un avis ne se modère pas.**
 * Décision d'exploitation du 11 octobre 2026 : les avis sont publiés
 * immédiatement et **ne sont jamais retirés** — retirer un mauvais avis est un
 * signe de méfiance envers la plateforme, et une vitrine qui n'affiche que des
 * éloges ne rassure personne. Le recours d'un partenaire est la réponse
 * publique, depuis `/pro/avis`.
 *
 * Cet écran sert donc à **lire**, et à un seul geste : retirer le *texte* d'un
 * avis au contenu illicite — insulte nominative, coordonnées, données
 * personnelles — la note restant comptée et l'avis affiché.
 *
 * Ce qui est montré d'abord : les avis sévères **publiés**. Non pour les
 * retirer — la plupart sont mérités, et les retirer tromperait les clients
 * suivants — mais pour savoir ce qui se dit, et voir si le partenaire a
 * répondu. Un avis sévère sans réponse est le vrai signal.
 */

export const metadata = { title: "Avis" };

export default async function AdminReviewsPage() {
  const avis = await getAdminReviews("tous");

  const moderes = avis.filter((a) => a.bodyRedactedAt !== null);
  const severes = avis.filter((a) => a.rating <= 2);
  const severesSansReponse = severes.filter((a) => a.reply === null);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Avis</h1>
      <p className="mt-1 text-sm text-slate-500">
        {avis.length === 0
          ? "Aucun avis déposé pour l'instant."
          : `${avis.length} avis · ${severes.length} à deux étoiles ou moins · ${moderes.length} commentaire${moderes.length > 1 ? "s" : ""} retiré${moderes.length > 1 ? "s" : ""}`}
      </p>

      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span>
          <strong>Aucun avis ne se retire</strong>, quelle que soit sa note et quel que soit
          le signalement. Le seul geste possible est de retirer un <em>texte</em> illicite —
          la note reste comptée, l&apos;avis reste affiché, et le motif s&apos;affiche à la
          place du commentaire. Pour tout le reste, le recours du partenaire est sa réponse
          publique.
        </span>
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
          {severesSansReponse.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">
                Sévères, et sans réponse
              </h2>
              <p className="mb-3 text-sm text-slate-500">
                Deux étoiles ou moins, et le prestataire n&apos;a pas encore répondu. C&apos;est
                le seul vrai signal de cet écran : un avis sévère est souvent mérité, mais un
                silence prolongé en dessous se lit comme un aveu. Une relance au partenaire
                vaut mieux qu&apos;une intervention.
              </p>
              <ul className="space-y-4">
                {severesSansReponse.map((a) => (
                  <li key={a.id}>
                    <ReviewModerationCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {moderes.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">
                Commentaires retirés
              </h2>
              <p className="mb-3 text-sm text-slate-500">
                Le texte d&apos;origine reste lisible ici, barré : c&apos;est lui qu&apos;on
                relira si l&apos;auteur réclame. Leurs notes comptent toujours dans la
                moyenne de leur prestataire.
              </p>
              <ul className="space-y-4">
                {moderes.map((a) => (
                  <li key={a.id}>
                    <ReviewModerationCard review={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Tous les avis</h2>
            <ul className="space-y-4">
              {avis.map((a) => (
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
