import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getPaymentByKey, PURPOSE_LABELS } from "@/lib/orders";

/**
 * Retour du prestataire de paiement.
 *
 * **Cette page ne valide rien.** Elle lit l'état que la base connaît, et rien
 * d'autre. Encaisser ici supposerait la clé de service dans un chemin
 * déclenché par un utilisateur, ce que le `CLAUDE.md` interdit — et surtout
 * cela reviendrait à croire un navigateur revenu d'un site tiers.
 *
 * C'est le webhook qui dénoue, et la tâche de rattrapage qui le supplée. Il est
 * donc normal qu'un client arrive ici quelques secondes avant la confirmation :
 * l'écran le dit, au lieu de laisser croire à un échec.
 */

export const metadata = { title: "Retour de paiement" };
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ cle?: string }>;
}) {
  await requireUser();

  const { cle } = await searchParams;
  const paiement = cle ? await getPaymentByKey(cle) : null;

  const etat = paiement?.status ?? "inconnu";
  const montant = paiement
    ? format(money(paiement.amount, (paiement.currency as CurrencyCode) ?? "XOF"))
    : null;

  const vue = {
    paid: {
      Icone: CheckCircle2,
      couleur: "text-teal-600",
      fond: "bg-teal-50",
      titre: "Paiement confirmé",
      texte: "Votre prestataire en est informé. Vous recevrez un récapitulatif par e-mail.",
    },
    pending: {
      Icone: Clock,
      couleur: "text-orange-500",
      fond: "bg-orange-50",
      titre: "Confirmation en cours",
      texte:
        "Votre paiement est en cours de vérification auprès de l'opérateur. " +
        "Cela prend en général moins d'une minute — vous pouvez fermer cette page, " +
        "nous vous préviendrons.",
    },
    failed: {
      Icone: XCircle,
      couleur: "text-slate-500",
      fond: "bg-slate-100",
      titre: "Paiement non abouti",
      texte:
        "Aucun montant n'a été débité. Vous pouvez réessayer depuis votre projet, " +
        "ou choisir un autre moyen de paiement.",
    },
    cancelled: {
      Icone: XCircle,
      couleur: "text-slate-500",
      fond: "bg-slate-100",
      titre: "Paiement annulé",
      texte: "Aucun montant n'a été débité. Votre commande vous attend toujours.",
    },
    refunded: {
      Icone: XCircle,
      couleur: "text-slate-500",
      fond: "bg-slate-100",
      titre: "Paiement remboursé",
      texte: "Ce règlement a été remboursé.",
    },
    inconnu: {
      Icone: Clock,
      couleur: "text-slate-500",
      fond: "bg-slate-100",
      titre: "Paiement introuvable",
      texte:
        "Nous ne retrouvons pas ce règlement. S'il a été débité, il apparaîtra " +
        "dans votre projet d'ici quelques minutes.",
    },
  }[etat as "paid" | "pending" | "failed" | "cancelled" | "refunded" | "inconnu"];

  const { Icone } = vue;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${vue.fond}`}
        >
          <Icone className={`h-7 w-7 ${vue.couleur}`} aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-900">{vue.titre}</h1>

        {paiement ? (
          <p className="mt-2 text-sm font-medium text-slate-500">
            {PURPOSE_LABELS[paiement.purpose]} de {montant} · {paiement.reference}
          </p>
        ) : null}

        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-500">{vue.texte}</p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/projets"
            className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-orange-600 active:scale-[0.98]"
          >
            Revenir à mes projets
          </Link>
          <Link
            href="/compte"
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
          >
            Mon espace
          </Link>
        </div>
      </div>
    </main>
  );
}
