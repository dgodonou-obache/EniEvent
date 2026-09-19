import { Wallet } from "lucide-react";

import { PaymentTable } from "@/components/money/PaymentTable";
import { StatTile } from "@/components/money/StatTile";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getPartnerTakings } from "@/lib/orders";

/**
 * Revenus d'un partenaire.
 *
 * **Le premier chiffre ne compte que ce qui a été réellement encaissé.**
 * Additionner les échéances à venir annoncerait un revenu que personne n'a
 * versé — c'est le chiffre qu'un partenaire lit en premier, et celui qu'il ne
 * faut pas gonfler. « Attendu » est une colonne à part, et le dit.
 *
 * ⚠️ Rien n'est encore **viré** : la ventilation est enregistrée à chaque
 * encaissement, mais le versement aux partenaires reste à construire. L'écran
 * le dit plutôt que de laisser croire à un virement en route.
 */

export const metadata = { title: "Mes revenus" };

export default async function PartnerRevenuePage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const { takings, lines } = await getPartnerTakings(decision.org.orgId);
  const regles = lines.filter((l) => l.status === "paid");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes revenus</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce que vos clients ont réglé, et ce qui vous revient.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Vous avez gagné"
          amount={takings.partnerDue}
          currency={takings.currency}
          tone="encaisse"
          hint="Sur les règlements déjà encaissés, commission déduite"
        />
        <StatTile
          label="Encaissé par ÉniEvent"
          amount={takings.collected}
          currency={takings.currency}
          hint="Ce que les clients ont effectivement payé"
        />
        <StatTile
          label="Commission retenue"
          amount={takings.commission}
          currency={takings.currency}
          hint="Part de la plateforme sur ces règlements"
        />
        <StatTile
          label="Reste à venir"
          amount={takings.expected}
          currency={takings.currency}
          tone="attente"
          hint="Échéances non encore réglées sur vos réservations en cours"
        />
      </div>

      <p className="mb-6 rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-900">
        <strong>Les versements ne sont pas encore automatiques.</strong> Votre part est
        calculée et enregistrée à chaque encaissement, mais le virement vers votre compte
        Mobile Money reste à mettre en place. Nous vous préviendrons dès que ce sera actif.
      </p>

      <h2 className="mb-3 text-lg font-bold text-slate-900">Détail des règlements</h2>

      {regles.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun règlement encaissé"
          description="Les paiements de vos clients apparaîtront ici dès le premier encaissement, avec le détail de ce qui vous revient."
        />
      ) : (
        <PaymentTable lines={regles} showSplit />
      )}
    </div>
  );
}
