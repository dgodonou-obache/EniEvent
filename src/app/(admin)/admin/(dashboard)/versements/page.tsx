import { PayoutQueue } from "@/components/admin/PayoutQueue";
import { StatTile } from "@/components/money/StatTile";
import { requireUser } from "@/lib/auth/session";
import { getPayoutCandidates, getPayouts } from "@/lib/payouts";

/**
 * Versements aux partenaires.
 *
 * **Le virement n'est pas automatique, et c'est assumé.** FedaPay refuse
 * `/payouts` sur ce compte — « Opération non autorisée », le droit d'émettre
 * des virements demandant un compte marchand validé. Les versements se font
 * donc par les moyens du bord et se consignent ici, avec leur référence de
 * transaction.
 *
 * Quand le droit sera ouvert, seule `mark_payout_sent` aura à changer : tout
 * le reste — le calcul de ce qui est dû, le rattachement des encaissements,
 * la trace — est déjà en place.
 */

export const metadata = { title: "Versements" };

export default async function AdminPayoutsPage() {
  await requireUser("/admin/connexion");

  const [candidates, payouts] = await Promise.all([getPayoutCandidates(), getPayouts(200)]);

  const devise = candidates[0]?.currency ?? payouts[0]?.currency ?? "XOF";
  const aVerser = candidates.reduce((t, c) => t + c.payable, 0);
  const retenu = candidates.reduce((t, c) => t + c.held, 0);
  const prepares = payouts.filter((p) => p.status === "pending");
  const envoyes = payouts.filter((p) => p.status === "sent");

  const sansCoordonnees = candidates.filter((c) => c.account === null && c.payable > 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Versements</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce que la plateforme doit aux partenaires, et ce qu&apos;elle a envoyé.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="À verser"
          amount={aVerser}
          currency={devise}
          tone="attente"
          hint={`${candidates.length} partenaire${candidates.length > 1 ? "s" : ""} concerné${candidates.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="Retenu"
          amount={retenu}
          currency={devise}
          hint="Encaissé, versable après la prestation"
        />
        <StatTile
          label="Préparés"
          amount={prepares.reduce((t, p) => t + p.amount, 0)}
          currency={devise}
          hint={`${prepares.length} en attente d'envoi`}
        />
        <StatTile
          label="Envoyés"
          amount={envoyes.reduce((t, p) => t + p.amount, 0)}
          currency={devise}
          tone="encaisse"
          hint={`${envoyes.length} versement${envoyes.length > 1 ? "s" : ""}`}
        />
      </div>

      <p className="mb-6 rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-900">
        <strong>Les virements se font à la main.</strong> FedaPay refuse l&apos;émission de
        versements sur ce compte tant que le compte marchand n&apos;est pas validé. Envoyez
        le montant par Mobile Money, puis consignez ici la référence de la transaction —
        c&apos;est elle qui permettra de retrouver le virement en cas de contestation.
        {sansCoordonnees.length > 0
          ? ` ${sansCoordonnees.length} partenaire${sansCoordonnees.length > 1 ? "s n'ont" : " n'a"} pas renseigné ses coordonnées.`
          : ""}
      </p>

      {/* La retenue est la règle la moins évidente de tout l'écran : sans un
          mot, un montant encaissé qui ne part pas se lit comme une panne. */}
      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Un encaissement n&apos;est versable qu&apos;après la prestation.</strong> Tant que
        la date n&apos;est pas passée, le client peut encore annuler et se faire rembourser selon
        le barème de l&apos;annonce — verser plus tôt reviendrait à redemander l&apos;argent au
        partenaire. Une réservation annulée, elle, libère immédiatement ce qui lui reste acquis.
      </p>

      <PayoutQueue candidates={candidates} payouts={payouts} />
    </div>
  );
}
