import { Wallet } from "lucide-react";

import { BudgetManager } from "@/components/company/BudgetManager";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getBudgetUsage } from "@/lib/company";

export const metadata = { title: "Budgets" };

/** Les rôles qui tiennent les cordons de la bourse, alignés sur la RLS. */
const MANAGERS = ["owner", "admin", "finance"];

export default async function BudgetsPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const usage = await getBudgetUsage(decision.org.orgId);
  const canManage = MANAGERS.includes(decision.org.role);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Budgets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Une enveloppe par centre de coût, et ce qui a déjà été engagé dessus. « Engagé »
          compte les offres retenues — une acceptation engage l&apos;entreprise bien avant le
          premier paiement.
        </p>
      </div>

      {usage.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun centre de coût"
          description={
            canManage
              ? "Créez-en un pour rattacher vos demandes à une enveloppe et suivre ce qui a été engagé."
              : "Votre équipe finance n'a pas encore créé de centre de coût."
          }
          action={canManage ? <BudgetManager usage={[]} canManage /> : undefined}
        />
      ) : (
        <BudgetManager usage={usage} canManage={canManage} />
      )}
    </div>
  );
}
