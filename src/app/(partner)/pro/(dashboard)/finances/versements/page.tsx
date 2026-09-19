import Link from "next/link";
import { AlertTriangle, Banknote } from "lucide-react";

import { StatTile } from "@/components/money/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money } from "@/lib/money";
import { getPayoutAccount, getPayouts, getPendingPayoutAmount } from "@/lib/payouts";

/**
 * Versements reçus par un partenaire.
 *
 * **L'écran doit dire la vérité sur l'automatisation.** Tant que FedaPay
 * refuse `/payouts` sur ce compte — « Opération non autorisée », le droit
 * d'émettre des virements demandant un compte marchand validé — les
 * versements partent à la main. Laisser croire à un virement automatique
 * ferait attendre un partenaire pour rien.
 */

export const metadata = { title: "Mes versements" };

const QUAND = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function PartnerPayoutsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;

  const [payouts, compte, attente] = await Promise.all([
    getPayouts(),
    getPayoutAccount(orgId),
    getPendingPayoutAmount(orgId),
  ]);

  const devise = payouts[0]?.currency ?? "XOF";
  const envoyes = payouts.filter((p) => p.status === "sent");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes versements</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce qu&apos;ÉniEvent vous a reversé, et ce qui vous attend.
        </p>
      </div>

      {!compte ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-orange-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong>Vos coordonnées de versement manquent.</strong> Sans elles, votre part
              reste en attente : nous ne savons pas où l&apos;envoyer.
            </span>
          </p>
          <Link href="/pro/parametres">
            <Button size="sm">Les renseigner</Button>
          </Link>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="En attente de versement"
          amount={attente}
          currency={devise}
          tone="attente"
          hint="Votre part sur les règlements déjà encaissés"
        />
        <StatTile
          label="Déjà versé"
          amount={envoyes.reduce((t, p) => t + p.amount, 0)}
          currency={devise}
          tone="encaisse"
          hint={`${envoyes.length} versement${envoyes.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="En préparation"
          amount={payouts.filter((p) => p.status === "pending").reduce((t, p) => t + p.amount, 0)}
          currency={devise}
          hint="Montants réunis, en attente d'envoi"
        />
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        Les versements sont préparés et envoyés <strong>manuellement</strong> pour l&apos;instant.
        {compte
          ? ` Ils partent vers votre compte ${compte.method === "virement" ? "bancaire" : "Mobile Money"} au nom de ${compte.holder_name}.`
          : ""}{" "}
        Le virement automatique arrivera avec l&apos;ouverture de notre compte marchand.
      </p>

      <h2 className="mb-3 text-lg font-bold text-slate-900">Historique</h2>

      {payouts.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Aucun versement pour l'instant"
          description="Vos versements apparaîtront ici dès le premier envoi. Votre part est calculée à chaque règlement encaissé."
        />
      ) : (
        <ul className="space-y-3">
          {payouts.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-100 bg-white p-4"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{p.reference}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {p.methodLabel}
                  {p.sentAt ? ` · envoyé le ${QUAND.format(new Date(p.sentAt))}` : ""}
                  {p.providerRef ? ` · réf. ${p.providerRef}` : ""}
                </p>
              </div>

              <div className="text-right">
                <p className="font-bold tabular-nums text-slate-900">
                  {format(money(p.amount, p.currency))}
                </p>
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    p.status === "sent" ? "text-teal-700" : "text-orange-600"
                  }`}
                >
                  {p.statusLabel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
