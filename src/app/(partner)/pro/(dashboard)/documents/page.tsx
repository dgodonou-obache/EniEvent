import { DocumentManager, type KycDocument } from "@/components/partner/DocumentManager";
import { requireSpace } from "@/lib/auth/session";
import { KYC_ROLES, KYC_TYPES } from "@/lib/validation/partner";
import { createClient } from "@/utils/supabase/server";

/**
 * Pièces justificatives du partenaire.
 *
 * **Ce que ces pièces ouvrent est dit en tête, pas deviné.** Personne ne
 * dépose une copie de sa carte d'identité par curiosité : l'écran annonce donc
 * à quoi elles servent — être payé, et porter le badge « vérifié ».
 *
 * ⚠️ **Seuls le propriétaire et le comptable peuvent déposer** : c'est ce
 * qu'imposent `kyc_documents_insert` (migration 0002) et les politiques du
 * seau privé (0041). Un équipier voit donc l'état d'avancement sans bouton —
 * offrir un geste que la base refuse est pire que ne rien offrir.
 */

export const metadata = { title: "Documents" };

export default async function PartnerDocumentsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;
  const supabase = await createClient();

  const { data } = await supabase
    .from("kyc_documents")
    .select("id, type, status, rejection_reason, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const documents: KycDocument[] = (data ?? []).map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    rejectionReason: d.rejection_reason,
    createdAt: d.created_at,
  }));

  const canUpload = KYC_ROLES.includes(decision.org.role);

  // On compte les **types** couverts, pas les fichiers : trois versions du même
  // RCCM ne font pas trois pièces.
  const validees = new Set(
    documents.filter((d) => d.status === "approved").map((d) => d.type),
  ).size;
  const aRefaire = documents.filter((d) => d.status === "rejected").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          {validees} pièce{validees > 1 ? "s" : ""} validée{validees > 1 ? "s" : ""} sur{" "}
          {KYC_TYPES.length}
          {aRefaire > 0 ? ` · ${aRefaire} à refaire` : ""}
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>À quoi servent ces pièces.</strong> Elles nous permettent de vous verser
        l&apos;argent de vos réservations, et d&apos;afficher le badge « vérifié » sur vos annonces
        — les clients réservent plus volontiers une structure identifiée. Elles ne sont visibles
        que par vous et par l&apos;équipe ÉniEvent, et ne sont jamais publiées.
      </p>

      {aRefaire > 0 ? (
        <p className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900">
          <span className="font-bold">
            {aRefaire} pièce{aRefaire > 1 ? "s sont" : " est"} à refaire.
          </span>{" "}
          Le motif est indiqué sous la pièce concernée. Déposez-en une nouvelle : la précédente
          sera remplacée.
        </p>
      ) : null}

      {!canUpload ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">Vous pouvez consulter, pas déposer.</span> Seuls le
          propriétaire et le comptable de la structure déposent les pièces justificatives — elles
          engagent la structure entière.
        </p>
      ) : null}

      <DocumentManager orgId={orgId} documents={documents} canUpload={canUpload} />
    </div>
  );
}
