import { Flag } from "lucide-react";

import { ReportCard } from "@/components/dashboard/ReportCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminReports } from "@/lib/reviews";

/**
 * Signalements de contenu.
 *
 * **Deux régimes, et l'écran doit les expliquer** — sans quoi il paraît
 * incohérent d'une ligne à l'autre :
 *
 * - un **avis** signalé par une partie concernée est déjà retiré, en attente
 *   d'examen, et il manque donc à la note du prestataire pendant ce temps ;
 * - une **annonce** signalée reste en ligne : la retirer sur simple
 *   signalement couperait les réservations d'un partenaire sur la parole d'un
 *   inconnu.
 *
 * Les ouverts d'abord, les plus anciens en tête : chaque jour d'attente sur un
 * avis masqué est un jour où la note de quelqu'un est fausse.
 *
 * ⚠️ Lecture par `admin_reports()` : l'écran a besoin du texte de l'avis
 * signalé et du nom du signaleur, qui vivent dans des tables fermées à
 * `authenticated` — et un administrateur en est un.
 */

export const metadata = { title: "Signalements" };

export default async function AdminReportsPage() {
  const signalements = await getAdminReports("tous");

  const ouverts = signalements.filter((s) => s.status === "open");
  const traites = signalements.filter((s) => s.status !== "open");
  const masques = ouverts.filter((s) => s.reviewHiddenAt !== null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Signalements</h1>
      <p className="mt-1 text-sm text-slate-500">
        {signalements.length === 0
          ? "Aucun signalement pour l'instant."
          : `${ouverts.length} à examiner · ${traites.length} tranché${traites.length > 1 ? "s" : ""}`}
      </p>

      {masques.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
          <strong>
            {masques.length} avis {masques.length > 1 ? "sont retirés" : "est retiré"} du public
          </strong>{" "}
          en attendant votre décision, et {masques.length > 1 ? "manquent" : "manque"} donc à la
          note de {masques.length > 1 ? "leurs prestataires" : "son prestataire"}. Chaque jour
          d&apos;attente est un jour où cette note est fausse.
        </p>
      ) : null}

      {signalements.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Flag}
            title="Aucun signalement"
            description="N'importe quel compte connecté peut signaler un avis ou une annonce. Un avis signalé par le prestataire concerné est retiré sur-le-champ et apparaîtra ici en priorité ; une annonce signalée reste en ligne jusqu'à votre décision."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {ouverts.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">À examiner</h2>
              <ul className="space-y-4">
                {[...ouverts]
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((s) => (
                    <li key={s.id}>
                      <ReportCard report={s} />
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {traites.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Tranchés</h2>
              <ul className="space-y-3">
                {traites.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-slate-400">{s.reference}</span>
                      <span className="font-bold text-slate-900">
                        {s.status === "upheld" ? "Retenu" : "Écarté"}
                      </span>
                      <span className="text-slate-500">
                        · {s.targetType === "review" ? "avis" : "annonce"} ·{" "}
                        {s.orgName ?? "partenaire inconnu"}
                      </span>
                    </p>
                    {s.resolution ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                        {s.resolution}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
