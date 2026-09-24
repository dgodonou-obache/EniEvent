import Link from "next/link";
import { FileText, Receipt as ReceiptIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getMyReceipts } from "@/lib/receipts";

/**
 * Les pièces que le client peut garder.
 *
 * ⚠️ **On dit « reçu », jamais « facture ».** Un reçu atteste d'un
 * encaissement ; une facture est une pièce fiscale qui engage un RCCM, un IFU
 * et une mention de TVA. `src/lib/legal.ts` porte encore ces valeurs à
 * `null` — émettre un document qui s'annonce comme une facture serait faux
 * dans le sens qui coûte cher. La facture arrive avec le lot B, et l'écran le
 * dit plutôt que de laisser chercher.
 *
 * **Pas de génération de PDF.** Chaque reçu a sa page, mise en forme pour
 * l'impression : le navigateur sait l'enregistrer en PDF, sur téléphone comme
 * sur ordinateur. Ajouter une bibliothèque de PDF pour ce seul document
 * alourdirait le déploiement sans rien apporter de plus.
 */

export const metadata = { title: "Documents" };

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function jour(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : JOUR.format(d);
}

export default async function DocumentsPage() {
  await requireSpace("account");

  const receipts = await getMyReceipts();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          {receipts.length === 0
            ? "Vos reçus de paiement apparaîtront ici."
            : `${receipts.length} reçu${receipts.length > 1 ? "s" : ""} de paiement.`}
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Ces documents sont des reçus, pas des factures.</strong> Un reçu atteste que vous
        avez réglé une somme ; une facture est une pièce fiscale, qui viendra plus tard. Si votre
        comptabilité en exige une, écrivez-nous et nous vous dirons où nous en sommes.
      </p>

      {receipts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun document pour l'instant"
          description="Dès votre premier règlement, le reçu correspondant s'ajoutera ici."
        />
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => {
            const devise = r.currency as CurrencyCode;

            return (
              <li key={r.id}>
                <Link
                  href={`/compte/documents/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      <ReceiptIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="truncate">
                        {r.listingTitle ?? r.partnerName ?? "Prestation"}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      {r.instalmentLabel ? <span>{r.instalmentLabel}</span> : null}
                      <span>Réglé le {jour(r.paidAt)}</span>
                      <span className="font-mono">{r.reference}</span>
                    </p>
                  </div>

                  <p className="shrink-0 font-bold tabular-nums text-slate-900">
                    {format(money(r.amount, devise))}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
