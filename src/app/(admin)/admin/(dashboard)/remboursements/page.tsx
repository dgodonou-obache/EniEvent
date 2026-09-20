import { RefundQueue } from "@/components/admin/RefundQueue";
import { StatTile } from "@/components/money/StatTile";
import { requireUser } from "@/lib/auth/session";
import { getRefunds } from "@/lib/refunds";

/**
 * Remboursements aux clients.
 *
 * **Le virement n'est pas automatique, et c'est assumé.** FedaPay répond
 * **401** sur `/refunds` avec la clé même qui obtient 200 sur `/transactions`
 * et `/currencies` : le droit de rembourser n'est pas accordé à ce compte,
 * exactement comme celui d'émettre des versements (403 sur `/payouts`). Les
 * remboursements se font donc par les moyens du bord et se consignent ici.
 *
 * Quand le droit sera ouvert, seule `mark_refund_sent` aura à changer : le
 * barème, le calcul et la trace sont déjà en place.
 */

export const metadata = { title: "Remboursements" };

export default async function AdminRefundsPage() {
  await requireUser("/admin/connexion");

  const refunds = await getRefunds();

  const devise = refunds[0]?.currency ?? "XOF";
  const attente = refunds.filter((r) => r.status === "pending");
  const envoyes = refunds.filter((r) => r.status === "sent");
  const aRecuperer = attente.filter((r) => r.needsRecovery);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Remboursements</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce que la plateforme doit rendre après une annulation, et ce qu&apos;elle a rendu.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="À rembourser"
          amount={attente.reduce((t, r) => t + r.amount, 0)}
          currency={devise}
          tone="attente"
          hint={`${attente.length} client${attente.length > 1 ? "s" : ""} en attente`}
        />
        <StatTile
          label="Remboursé"
          amount={envoyes.reduce((t, r) => t + r.amount, 0)}
          currency={devise}
          tone="encaisse"
          hint={`${envoyes.length} remboursement${envoyes.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="À récupérer"
          amount={aRecuperer.reduce((t, r) => t + r.amount, 0)}
          currency={devise}
          hint="Sommes déjà versées à un partenaire"
        />
      </div>

      <p className="mb-6 rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-900">
        <strong>Les remboursements se font à la main.</strong> FedaPay refuse l&apos;émission de
        remboursements sur ce compte tant que le compte marchand n&apos;est pas validé. Envoyez le
        montant par Mobile Money, puis consignez ici la référence de la transaction — c&apos;est
        elle qui permettra de retrouver le virement en cas de contestation.
      </p>

      <RefundQueue refunds={refunds} />
    </div>
  );
}
