import { Flag } from "lucide-react";

import { ReportCard } from "@/components/dashboard/ReportCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminReports } from "@/lib/reviews";

/**
 * Signalements de contenu.
 *
 * ⚠️ **Un signalement ne retire plus rien**, depuis la décision du 11 octobre
 * 2026 : il est redevenu ce qu'il aurait dû être — un signal adressé à
 * l'équipe, comme une demande d'assistance. Ni l'avis, ni l'annonce signalés ne
 * bougent, et aucune note ne change. L'écran doit le dire, sinon quelqu'un qui
 * se souvient de l'ancien comportement cherchera l'avis masqué.
 *
 * Trancher consigne donc une décision, et c'est tout. Retirer le *texte* d'un
 * avis illicite est un **second geste**, explicite, depuis `/admin/avis` — les
 * enchaîner ferait du signalement un bouton de suppression.
 *
 * Les ouverts d'abord, les plus anciens en tête : non parce qu'il y a urgence à
 * agir, mais parce qu'un signalement sans réponse est quelqu'un qu'on ignore.
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

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Signalements</h1>
      <p className="mt-1 text-sm text-slate-500">
        {signalements.length === 0
          ? "Aucun signalement pour l'instant."
          : `${ouverts.length} à examiner · ${traites.length} tranché${traites.length > 1 ? "s" : ""}`}
      </p>

      <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
        <strong>Un signalement ne retire rien.</strong> Ni l&apos;avis, ni l&apos;annonce
        visés ne bougent, et aucune note ne change — trancher ici consigne votre décision,
        rien de plus. Si le <em>texte</em> d&apos;un avis est illicite, retirez-le depuis{" "}
        <span className="font-semibold">Avis</span> : sa note continuera de compter.
      </p>

      {signalements.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Flag}
            title="Aucun signalement"
            description="N'importe quel compte connecté peut signaler un avis ou une annonce. Rien n'est retiré automatiquement : un signalement vous alerte, et c'est vous qui décidez. Un partenaire qui conteste un avis a d'abord son droit de réponse."
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
