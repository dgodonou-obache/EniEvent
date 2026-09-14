import { ShieldCheck } from "lucide-react";

import { ApprovalCard, type ApprovalView } from "@/components/company/ApprovalCard";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getApprovalContext, getApprovals, getBudgetUsage } from "@/lib/company";
import { APPROVER_ROLES } from "@/lib/validation/company";

export const metadata = { title: "Validations" };

export default async function ApprovalsPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;
  const canDecide = APPROVER_ROLES.includes(decision.org.role);

  const approvals = await getApprovals(orgId);
  const [context, budgets] = await Promise.all([
    getApprovalContext(orgId, approvals),
    getBudgetUsage(orgId),
  ]);

  // Indexé par code : c'est la seule clé que porte l'aval, et elle est unique
  // par entreprise.
  const remainingByCode = new Map(budgets.map((budget) => [budget.code, budget.remaining]));

  const views: ApprovalView[] = approvals.map((approval) => {
    const quote = context.quotes.get(approval.subject_id);
    const request = context.requests.get(approval.subject_id);
    const item = quote?.quote_request_items;
    const parent = item?.quote_requests;

    // `null` distingue « pas d'enveloppe » de « plus rien » : afficher 0 dans
    // le premier cas ferait croire à un dépassement.
    const rawRemaining = approval.cost_centers
      ? remainingByCode.get(approval.cost_centers.code)
      : null;

    return {
      id: approval.id,
      subject: approval.subject as "quote" | "quote_request",
      amount: approval.amount,
      currency: approval.currency ?? "XOF",
      status: approval.status,
      reason: approval.reason,
      createdAt: approval.created_at,
      requester: approval.requester?.full_name ?? null,
      costCenter: approval.cost_centers
        ? { code: approval.cost_centers.code, name: approval.cost_centers.name }
        : null,
      remaining: rawRemaining == null ? null : Number(rawRemaining),
      title: parent?.title ?? request?.title ?? "Engagement",
      subtitle:
        approval.subject === "quote"
          ? `${item?.categories?.name ?? "Prestation"} · ${parent?.city ?? ""} · ${parent?.reference ?? ""}`
          : `Publication de l'appel d'offres · ${request?.reference ?? ""}`,
      href: parent?.id ? `/projets/${parent.id}` : request?.id ? `/projets/${request.id}` : null,
      supplier:
        quote?.organizations?.brand_name ?? quote?.organizations?.legal_name ?? null,
      message: quote?.message ?? null,
    };
  });

  const pending = views.filter((view) => view.status === "pending");
  const decided = views.filter((view) => view.status !== "pending");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Validations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {canDecide
            ? "Les engagements qui attendent votre aval. Approuver retient l'offre et prévient le prestataire."
            : "Les engagements soumis à validation. Votre rôle ne permet pas de décider."}
        </p>
      </div>

      {pending.length === 0 && decided.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Rien à valider"
          description="Les engagements dépassant votre seuil de validation apparaîtront ici. Vous fixez ce seuil dans les paramètres de l'entreprise."
        />
      ) : (
        <div className="space-y-8">
          {pending.length > 0 ? (
            <section>
              <h2 className="mb-3 font-bold text-slate-900">
                {pending.length} en attente
              </h2>
              <ul className="space-y-3">
                {pending.map((view) => (
                  <ApprovalCard key={view.id} approval={view} canDecide={canDecide} />
                ))}
              </ul>
            </section>
          ) : null}

          {decided.length > 0 ? (
            <section>
              <h2 className="mb-3 font-bold text-slate-900">Historique</h2>
              <ul className="space-y-3">
                {decided.map((view) => (
                  <ApprovalCard key={view.id} approval={view} canDecide={false} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
