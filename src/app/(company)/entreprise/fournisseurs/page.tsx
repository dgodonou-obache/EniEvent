import { Handshake } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getSuppliers } from "@/lib/company";
import { format, money, type CurrencyCode } from "@/lib/money";

export const metadata = { title: "Fournisseurs" };

/**
 * Les prestataires avec qui l'entreprise a déjà travaillé.
 *
 * Regroupés par prestataire et non par commande : la question posée est « avec
 * qui travaillons-nous, et pour combien », pas « qu'avons-nous commandé ».
 * C'est aussi ce qui permettra plus tard de les solliciter directement.
 */
export default async function SuppliersPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const suppliers = await getSuppliers(decision.org.orgId);
  const total = suppliers.reduce((sum, supplier) => sum + supplier.total, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fournisseurs</h1>
        <p className="mt-1 text-sm text-slate-500">
          {suppliers.length === 0
            ? "Aucun prestataire retenu pour l'instant."
            : `${suppliers.length} prestataire${suppliers.length > 1 ? "s" : ""} · ${format(
                money(total, (suppliers[0]?.currency ?? "XOF") as CurrencyCode),
              )} engagés au total`}
        </p>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Aucun prestataire retenu"
          description="Dès qu'une offre est acceptée, son prestataire apparaît ici avec l'historique de ce que vous lui avez confié."
        />
      ) : (
        <ul className="space-y-3">
          {suppliers.map((supplier) => (
            <li
              key={supplier.orgId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:border-orange-200"
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-slate-900">{supplier.name}</h2>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {supplier.city ?? "—"} · {[...supplier.categories].join(", ")}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {supplier.count} prestation{supplier.count > 1 ? "s" : ""} retenue
                  {supplier.count > 1 ? "s" : ""}
                  {supplier.lastAt
                    ? ` · dernière le ${new Date(supplier.lastAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}`
                    : ""}
                </p>
              </div>

              <p className="shrink-0 font-bold text-slate-900 tabular-nums">
                {format(money(supplier.total, supplier.currency as CurrencyCode))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
