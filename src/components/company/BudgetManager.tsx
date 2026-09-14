"use client";

import * as React from "react";
import { Archive, CheckCircle2, Info, Loader2, Pencil, Plus, RotateCcw } from "lucide-react";

import {
  saveCostCenter,
  toggleCostCenter,
  type CompanyState,
} from "@/app/(company)/entreprise/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, money, type CurrencyCode } from "@/lib/money";

/**
 * Centres de coûts et consommation.
 *
 * L'« engagé » compte les offres retenues, pas les sommes versées : une offre
 * acceptée engage l'entreprise bien avant le premier paiement. C'est ce chiffre
 * qui doit alerter, pas celui de la trésorerie.
 *
 * Un centre de coût ne se supprime pas — les demandes passées y renvoient. Il
 * s'archive, et disparaît alors des nouvelles demandes.
 */

interface Usage {
  cost_center_id: string | null;
  code: string | null;
  name: string | null;
  currency: string | null;
  budget_amount: number | null;
  period_start: string | null;
  period_end: string | null;
  is_active: boolean | null;
  committed: number | null;
  remaining: number | null;
  request_count: number | null;
}

export function BudgetManager({ usage, canManage }: { usage: Usage[]; canManage: boolean }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const active = usage.filter((row) => row.is_active !== false);
  const archived = usage.filter((row) => row.is_active === false);

  return (
    <div className="space-y-4">
      {canManage ? (
        creating ? (
          <CostCenterForm onDone={() => setCreating(false)} />
        ) : (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nouveau centre de coût
          </Button>
        )
      ) : null}

      {active.length === 0 && archived.length === 0 ? null : (
        <ul className="space-y-3">
          {[...active, ...archived].map((row) => (
            <li
              key={row.cost_center_id}
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                row.is_active === false
                  ? "border-slate-100 bg-slate-50/60"
                  : "border-slate-100 bg-white hover:border-orange-200"
              }`}
            >
              {editing === row.cost_center_id ? (
                <CostCenterForm row={row} onDone={() => setEditing(null)} />
              ) : (
                <Row
                  row={row}
                  canManage={canManage}
                  onEdit={() => setEditing(row.cost_center_id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  row,
  canManage,
  onEdit,
}: {
  row: Usage;
  canManage: boolean;
  onEdit: () => void;
}) {
  const [state, formAction, pending] = React.useActionState<CompanyState, FormData>(
    toggleCostCenter,
    {},
  );

  const currency = (row.currency ?? "XOF") as CurrencyCode;
  const committed = Number(row.committed ?? 0);
  const envelope = row.budget_amount;
  const remaining = envelope != null ? envelope - committed : null;
  const usage = envelope && envelope > 0 ? Math.round((committed / envelope) * 100) : null;
  const archived = row.is_active === false;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {row.code}
            </span>
            <h2 className="truncate font-bold text-slate-900">{row.name}</h2>
            {archived ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Archivé
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {row.period_start && row.period_end
              ? `Du ${frenchDate(row.period_start)} au ${frenchDate(row.period_end)}`
              : "Sans période définie"}
            {" · "}
            {row.request_count ?? 0} demande{(row.request_count ?? 0) > 1 ? "s" : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold text-slate-900 tabular-nums">
            {format(money(committed, currency))}
          </p>
          <p className="text-xs text-slate-400">
            {envelope != null ? `sur ${format(money(envelope, currency))}` : "sans enveloppe"}
          </p>
        </div>
      </div>

      {envelope != null && envelope > 0 ? (
        <>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${usage} % engagé`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (remaining ?? 0) < 0
                  ? "bg-red-500"
                  : (usage ?? 0) > 80
                    ? "bg-amber-500"
                    : "bg-teal-500"
              }`}
              style={{ width: `${Math.min(100, usage ?? 0)}%` }}
            />
          </div>

          <p
            className={`mt-2 text-sm ${
              (remaining ?? 0) < 0 ? "font-bold text-red-700" : "text-slate-500"
            }`}
          >
            {(remaining ?? 0) < 0
              ? `Dépassement de ${format(money(Math.abs(remaining ?? 0), currency))}.`
              : `${format(money(remaining ?? 0, currency))} restant · ${usage} % engagé`}
          </p>
        </>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier
          </Button>

          <form action={formAction}>
            <input type="hidden" name="costCenterId" value={row.cost_center_id ?? ""} />
            <input type="hidden" name="active" value={String(archived)} />
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : archived ? (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Archive className="h-3.5 w-3.5" aria-hidden />
              )}
              {archived ? "Réactiver" : "Archiver"}
            </Button>
          </form>
        </div>
      ) : null}

      <Feedback state={state} />
    </>
  );
}

function CostCenterForm({ row, onDone }: { row?: Usage; onDone: () => void }) {
  const [state, formAction, pending] = React.useActionState<CompanyState, FormData>(
    saveCostCenter,
    {},
  );

  // Refermer dès que l'enregistrement a réussi : laisser le formulaire ouvert
  // laisserait croire qu'il reste quelque chose à faire.
  React.useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="rounded-2xl border border-slate-100 bg-white p-5">
      {row ? (
        <input type="hidden" name="costCenterId" value={row.cost_center_id ?? ""} />
      ) : null}

      <h2 className="font-bold text-slate-900">
        {row ? "Modifier le centre de coût" : "Nouveau centre de coût"}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            defaultValue={row?.code ?? ""}
            placeholder="MARKETING-2026"
            required
          />
          <FieldError message={state.errors?.code} />
          <p className="mt-1 text-xs text-slate-400">
            Court et stable : c&apos;est lui qui apparaît sur les demandes.
          </p>
        </div>

        <div>
          <Label htmlFor="name">Intitulé</Label>
          <Input
            id="name"
            name="name"
            defaultValue={row?.name ?? ""}
            placeholder="Événements marketing"
            required
          />
          <FieldError message={state.errors?.name} />
        </div>

        <div>
          <Label htmlFor="budgetAmount">Enveloppe (FCFA)</Label>
          <Input
            id="budgetAmount"
            name="budgetAmount"
            inputMode="numeric"
            defaultValue={row?.budget_amount ?? ""}
            placeholder="15000000"
          />
          <FieldError message={state.errors?.budgetAmount} />
          <p className="mt-1 text-xs text-slate-400">
            Facultative. Sans elle, la consommation s&apos;affiche sans plafond.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="periodStart">Début de période</Label>
            <Input
              id="periodStart"
              name="periodStart"
              placeholder="2026-01-01"
              defaultValue={row?.period_start ?? ""}
            />
            <FieldError message={state.errors?.periodStart} />
          </div>
          <div>
            <Label htmlFor="periodEnd">Fin</Label>
            <Input
              id="periodEnd"
              name="periodEnd"
              placeholder="2026-12-31"
              defaultValue={row?.period_end ?? ""}
            />
            <FieldError message={state.errors?.periodEnd} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Enregistrer
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>

      <Feedback state={state} />
    </form>
  );
}

function Feedback({ state }: { state: CompanyState }) {
  if (!state.message) return null;

  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
        state.ok ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-700"
      }`}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {state.message}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

function frenchDate(value: string): string {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
