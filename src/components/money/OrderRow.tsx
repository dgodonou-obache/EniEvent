import { CalendarDays, CheckCircle2, Clock } from "lucide-react";

import { format, money, type CurrencyCode } from "@/lib/money";
import type { OrderView } from "@/lib/orders";

/**
 * Une commande, telle qu'elle se lit dans une liste.
 *
 * Deux publics, une seule présentation : le client veut savoir **ce qu'il lui
 * reste à payer**, le partenaire **ce qu'il va toucher**. Le composant montre
 * donc l'un ou l'autre selon `perspective`, plutôt que d'afficher les deux et
 * de laisser chacun chercher sa ligne.
 *
 * L'avancement est une barre, pas un pourcentage écrit : « 3 échéances sur 5 »
 * se compte, « 60 % » se calcule.
 */

interface Props {
  order: OrderView;
  perspective: "client" | "partner" | "admin";
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function jour(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : JOUR.format(d);
}

export function OrderRow({ order, perspective }: Props) {
  const devise = order.currency as CurrencyCode;
  const somme = (n: number) => format(money(n, devise));

  const reglees = order.instalments.filter((i) => i.paid).length;
  const total = order.instalments.length;
  const avancement = total === 0 ? 0 : Math.round((reglees / total) * 100);
  const reste = order.total - order.paidAmount;

  const date = jour(order.eventDate);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">
            {perspective === "partner" || perspective === "admin"
              ? order.reference
              : (order.partnerName ?? "Prestation")}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {perspective === "client" ? <span>{order.reference}</span> : null}
            {perspective !== "client" && order.partnerName ? (
              <span>{order.partnerName}</span>
            ) : null}
            {date ? (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden />
                {date}
              </span>
            ) : null}
          </p>
        </div>

        <div className="text-right">
          <p className="font-bold tabular-nums text-slate-900">{somme(order.total)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {order.statusLabel}
          </p>
        </div>
      </div>

      {total > 0 ? (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={avancement}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${reglees} échéance${reglees > 1 ? "s" : ""} réglée${reglees > 1 ? "s" : ""} sur ${total}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                avancement === 100 ? "bg-teal-500" : "bg-orange-400"
              }`}
              style={{ width: `${avancement}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              {avancement === 100 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" aria-hidden />
              ) : (
                <Clock className="h-3.5 w-3.5 text-orange-500" aria-hidden />
              )}
              {reglees} sur {total} échéance{total > 1 ? "s" : ""}
            </span>

            {perspective === "client" ? (
              reste > 0 ? (
                <span className="text-slate-600">
                  Reste à régler <strong className="text-slate-900">{somme(reste)}</strong>
                </span>
              ) : (
                <span className="font-semibold text-teal-700">Intégralement réglé</span>
              )
            ) : (
              <span className="text-slate-600">
                Vous touchez <strong className="text-slate-900">{somme(order.partnerDue)}</strong>
                <span className="text-slate-400"> · commission {somme(order.commission)}</span>
              </span>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
