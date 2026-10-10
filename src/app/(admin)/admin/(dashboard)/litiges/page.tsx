import { Scale } from "lucide-react";

import { DisputeCard } from "@/components/dashboard/DisputeCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminDisputes } from "@/lib/reviews";

/**
 * Litiges — les réservations contestées.
 *
 * Un litige n'est pas un signalement : il porte sur une **réservation payée**,
 * il a **deux parties** qui ne racontent pas la même chose, et il touche à
 * l'argent. D'où sa place dans la section Finances du menu, et non dans
 * Système.
 *
 * **Les plus anciens d'abord**, sans exception. Un litige n'a pas de hiérarchie
 * utile — le montant ne dit pas l'urgence, et trier par somme reviendrait à
 * faire attendre les petits clients. L'ordre d'arrivée est le seul qui soit
 * défendable devant les deux parties.
 *
 * ⚠️ **Aucun remboursement ne part d'ici.** Voir `actions.ts` : il existe un
 * chemin vers l'argent, `cancel_order`, et il applique le barème figé sur la
 * commande. Cet écran consigne une décision et rattache le remboursement
 * produit par l'annulation.
 */

export const metadata = { title: "Litiges" };

export default async function AdminDisputesPage() {
  const litiges = await getAdminDisputes("tous");

  const ouverts = litiges.filter((l) => l.status === "open");
  const enExamen = litiges.filter((l) => l.status === "under_review");
  const clos = litiges.filter((l) => !["open", "under_review"].includes(l.status));

  const enJeu = [...ouverts, ...enExamen].reduce((total, l) => total + l.paidAmount, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Litiges</h1>
      <p className="mt-1 text-sm text-slate-500">
        {litiges.length === 0
          ? "Aucune réservation contestée."
          : `${ouverts.length + enExamen.length} en cours · ${clos.length} clos`}
      </p>

      {enJeu > 0 ? (
        <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
          Les litiges en cours portent sur des sommes <strong>déjà encaissées</strong>. Tant
          qu&apos;ils ne sont pas tranchés, elles sont ni versées au prestataire ni rendues au
          client — c&apos;est le genre d&apos;attente qui coûte la confiance des deux côtés.
        </p>
      ) : null}

      {litiges.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Scale}
            title="Aucune réservation contestée"
            description="Un litige ne peut être ouvert que par l'une des deux parties d'une réservation dont un règlement a été encaissé. Sans argent déplacé, le recours est l'annulation — qui applique un barème connu — ou le support."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {ouverts.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">À prendre en charge</h2>
              <p className="mb-3 text-sm text-slate-500">
                Les plus anciens d&apos;abord. Une seule version a été écrite : demandez la
                seconde avant de trancher.
              </p>
              <ul className="space-y-4">
                {ouverts.map((l) => (
                  <li key={l.id}>
                    <DisputeCard dispute={l} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {enExamen.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">En examen</h2>
              <ul className="space-y-4">
                {enExamen.map((l) => (
                  <li key={l.id}>
                    <DisputeCard dispute={l} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {clos.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Clos</h2>
              <ul className="space-y-4">
                {clos.map((l) => (
                  <li key={l.id}>
                    <DisputeCard dispute={l} />
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
