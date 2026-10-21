import { format, money } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, type MoneyLine } from "@/lib/orders";

/**
 * Journal des règlements.
 *
 * Un tableau, parce qu'on y cherche une ligne précise — une référence, une
 * date, un montant — et non une vue d'ensemble. Il défile horizontalement dans
 * son propre conteneur : sur un téléphone, c'est la seule façon de garder des
 * colonnes de chiffres alignées sans casser la page (`CLAUDE.md` §6).
 *
 * `showSplit` n'est montré qu'à qui la ventilation concerne : un client n'a pas
 * à savoir ce que la plateforme retient.
 *
 * ⚠️ `showReason` suit la même règle, pour deux raisons distinctes : le motif
 * d'un échec est un **code d'opérateur**, donc du jargon qu'un client ne doit
 * pas lire (`CLAUDE.md` §5), et les déboires bancaires d'un client ne regardent
 * pas son prestataire. Il n'est donc rendu que depuis `/admin/paiements`.
 */

interface Props {
  lines: readonly MoneyLine[];
  showSplit?: boolean;
  showReason?: boolean;
}

const QUAND = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TONS: Record<MoneyLine["status"], string> = {
  paid: "bg-teal-50 text-teal-700",
  pending: "bg-orange-50 text-orange-700",
  failed: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-600",
  refunded: "bg-slate-100 text-slate-600",
};

export function PaymentTable({ lines, showSplit = false, showReason = false }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <Th>Date</Th>
            <Th>Règlement</Th>
            <Th>Commande</Th>
            <Th align="right">Montant</Th>
            {showSplit ? <Th align="right">Vous touchez</Th> : null}
            {showSplit ? <Th align="right">Commission</Th> : null}
            <Th align="right">État</Th>
          </tr>
        </thead>

        <tbody>
          {lines.map((l) => {
            const somme = (n: number) => format(money(n, l.currency));
            const quand = new Date(l.paidAt ?? l.createdAt);

            return (
              <tr key={l.id} className="border-b border-slate-50 last:border-0">
                <Td className="whitespace-nowrap text-slate-500">
                  {Number.isNaN(quand.getTime()) ? "—" : QUAND.format(quand)}
                </Td>
                <Td>
                  <span className="font-medium text-slate-900">
                    {l.instalmentLabel ?? "Règlement"}
                  </span>
                  <span className="block text-xs text-slate-400">{l.reference}</span>
                </Td>
                <Td className="text-slate-500">{l.orderReference ?? "—"}</Td>
                <Td align="right" className="font-bold tabular-nums text-slate-900">
                  {somme(l.amount)}
                </Td>
                {showSplit ? (
                  <Td align="right" className="tabular-nums text-slate-700">
                    {somme(l.partnerDue)}
                  </Td>
                ) : null}
                {showSplit ? (
                  <Td align="right" className="tabular-nums text-slate-400">
                    {somme(l.commission)}
                  </Td>
                ) : null}
                <Td align="right">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONS[l.status]}`}
                  >
                    {PAYMENT_STATUS_LABELS[l.status]}
                  </span>
                  {showReason && l.lastError && l.status !== "paid" ? (
                    <span className="mt-1 block max-w-[16rem] text-xs leading-snug text-slate-400">
                      {l.lastError}
                    </span>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}>{children}</td>
  );
}
