import { Banknote } from "lucide-react";

import { PaymentTable } from "@/components/money/PaymentTable";
import { StatTile } from "@/components/money/StatTile";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getPayments } from "@/lib/orders";

/**
 * Tous les règlements de la plateforme.
 *
 * L'administration voit tout : la politique RLS de `payments` admet
 * `app.is_admin()`. Le proxy a déjà refusé l'accès à quiconque n'est pas
 * administrateur (`CLAUDE.md` §4) — cette page n'a donc pas à le revérifier,
 * mais elle ne contourne rien non plus : aucune clé de service ici.
 *
 * Les trois chiffres du haut sont ceux qu'on vient chercher : ce qui est
 * entré, ce que la plateforme a gardé, et ce qui est resté en route.
 */

export const metadata = { title: "Paiements" };

export default async function AdminPaymentsPage() {
  await requireUser("/admin/connexion");

  const lines = await getPayments(300);
  const devise = lines[0]?.currency ?? "XOF";

  const regles = lines.filter((l) => l.status === "paid");
  const enCours = lines.filter((l) => l.status === "pending");
  const echoues = lines.filter((l) => l.status === "failed");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paiements</h1>
        <p className="mt-1 text-sm text-slate-500">
          {lines.length === 0
            ? "Aucun règlement enregistré."
            : `${lines.length} règlement${lines.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Aucun règlement"
          description="Les paiements apparaîtront ici dès la première réservation réglée, avec la part revenant au partenaire et la commission retenue."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Encaissé"
              amount={regles.reduce((t, l) => t + l.amount, 0)}
              currency={devise}
              tone="encaisse"
              hint={`${regles.length} règlement${regles.length > 1 ? "s" : ""} confirmé${regles.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Commission"
              amount={regles.reduce((t, l) => t + l.commission, 0)}
              currency={devise}
              hint="Part de la plateforme sur ces règlements"
            />
            <StatTile
              label="Dû aux partenaires"
              amount={regles.reduce((t, l) => t + l.partnerDue, 0)}
              currency={devise}
              tone="attente"
              hint="Enregistré, pas encore viré"
            />
            <StatTile
              label="En cours"
              amount={enCours.reduce((t, l) => t + l.amount, 0)}
              currency={devise}
              hint={`${enCours.length} ouvert${enCours.length > 1 ? "s" : ""} · ${echoues.length} échoué${echoues.length > 1 ? "s" : ""}`}
            />
          </div>

          <PaymentTable lines={lines} showSplit />
        </>
      )}
    </div>
  );
}
