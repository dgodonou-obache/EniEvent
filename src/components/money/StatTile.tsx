import { format, money, type CurrencyCode } from "@/lib/money";

/**
 * Un chiffre, et ce qu'il recouvre.
 *
 * La phrase sous le montant n'est pas décorative : « encaissé » et « attendu »
 * se ressemblent à l'œil et ne valent pas la même chose. Un partenaire qui
 * confond les deux croit avoir reçu de l'argent qu'on lui doit encore.
 */

interface Props {
  label: string;
  amount: number;
  currency: CurrencyCode;
  hint?: string;
  tone?: "neutre" | "encaisse" | "attente";
}

const TONS = {
  neutre: "text-slate-900",
  encaisse: "text-teal-700",
  attente: "text-orange-600",
} as const;

export function StatTile({ label, amount, currency, hint, tone = "neutre" }: Props) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${TONS[tone]}`}>
        {format(money(amount, currency))}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}
