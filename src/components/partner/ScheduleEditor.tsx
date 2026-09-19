"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Wallet } from "lucide-react";

import { saveSchedule, type ScheduleState } from "@/app/(partner)/pro/(dashboard)/parametres/actions";
import { Button } from "@/components/ui/button";
import { resolveSchedule, type ScheduleRow } from "@/lib/fees";
import { format, money } from "@/lib/money";

/**
 * Composition des conditions de règlement.
 *
 * L'idée à faire passer tient en une phrase : **la dernière ligne est le
 * solde**, et elle vaut ce qui reste. C'est ce qui garantit qu'un échéancier
 * réclame exactement le montant de la commande, jamais plus, jamais moins —
 * même quand un pourcentage tombe mal. L'éditeur l'impose donc au lieu de le
 * laisser au soin du partenaire : la ligne « solde » ne se supprime pas et ne
 * se déplace pas.
 *
 * L'aperçu chiffré n'est pas un ornement. Un partenaire qui compose « 30 % puis
 * un fixe de 100 000 » ne voit pas ce que cela donne sur une commande réelle ;
 * l'aperçu emploie `resolveSchedule`, **le même calcul que la base**, sur un
 * montant d'exemple qu'il peut changer.
 */

type Trigger = "booking" | "before_event";
type Kind = "percent" | "fixed" | "balance";

interface Ligne {
  cle: string;
  label: string;
  trigger: Trigger;
  daysBefore: string;
  kind: Kind;
  percent: string;
  fixedAmount: string;
}

interface Props {
  orgId: string;
  initial: Ligne[];
}

const EXEMPLES = [500_000, 1_500_000, 5_000_000];

function nouvelleCle() {
  return Math.random().toString(36).slice(2, 10);
}

export function ScheduleEditor({ orgId, initial }: Props) {
  const [lignes, setLignes] = React.useState<Ligne[]>(initial);
  const [exemple, setExemple] = React.useState(EXEMPLES[1]);
  const [state, action, pending] = React.useActionState<ScheduleState, FormData>(saveSchedule, {});

  const avances = lignes.filter((l) => l.kind !== "balance");
  const solde = lignes.find((l) => l.kind === "balance");

  function modifier(cle: string, champ: Partial<Ligne>) {
    setLignes((actuelles) => actuelles.map((l) => (l.cle === cle ? { ...l, ...champ } : l)));
  }

  function ajouter() {
    const suivante: Ligne = {
      cle: nouvelleCle(),
      label: `Versement ${avances.length + 1}`,
      trigger: "before_event",
      daysBefore: "30",
      kind: "percent",
      percent: "25",
      fixedAmount: "",
    };
    // Toujours insérée **avant** le solde : celui-ci reste la dernière ligne
    // par construction, et le partenaire n'a pas à y penser.
    setLignes([...avances, suivante, ...(solde ? [solde] : [])]);
  }

  function supprimer(cle: string) {
    setLignes((actuelles) => actuelles.filter((l) => l.cle !== cle));
  }

  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    if (cible < 0 || cible >= avances.length) return;

    const copie = [...avances];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    setLignes([...copie, ...(solde ? [solde] : [])]);
  }

  // Aperçu : exactement le calcul de la base, sur un montant d'exemple.
  const apercu = React.useMemo(() => {
    const rows: ScheduleRow[] = lignes.map((l) => ({
      label: l.label || "Échéance",
      trigger: l.trigger,
      daysBefore: l.trigger === "booking" ? null : Number(l.daysBefore) || 0,
      amountKind: l.kind,
      percent: l.kind === "percent" ? Number(l.percent) || 0 : null,
      fixedAmount: l.kind === "fixed" ? Number(l.fixedAmount) || 0 : null,
    }));

    try {
      return resolveSchedule(money(exemple, "XOF"), rows);
    } catch {
      return [];
    }
  }, [lignes, exemple]);

  const charge = JSON.stringify(
    lignes.map((l) => ({
      label: l.label,
      trigger: l.trigger,
      days_before: l.daysBefore,
      amount_kind: l.kind,
      percent: l.percent,
      fixed_amount: l.fixedAmount,
    })),
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="lignes" value={charge} />

      <div className="space-y-3">
        {avances.map((ligne, index) => (
          <div
            key={ligne.cle}
            className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={ligne.label}
                onChange={(e) => modifier(ligne.cle, { label: e.target.value })}
                aria-label="Nom de l'échéance"
                className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 transition-all duration-300 focus:border-orange-200 focus:bg-white focus:outline-none"
              />
              <div className="flex gap-1">
                <IconButton label="Monter" onClick={() => deplacer(index, -1)} disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton
                  label="Descendre"
                  onClick={() => deplacer(index, 1)}
                  disabled={index === avances.length - 1}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Supprimer" onClick={() => supprimer(ligne.cle)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Quand
                </span>
                <div className="mt-1 flex gap-2">
                  <select
                    value={ligne.trigger}
                    onChange={(e) => modifier(ligne.cle, { trigger: e.target.value as Trigger })}
                    className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition-all duration-300 focus:border-orange-200 focus:bg-white focus:outline-none"
                  >
                    <option value="booking">À la réservation</option>
                    <option value="before_event">Avant l&apos;événement</option>
                  </select>
                  {ligne.trigger === "before_event" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={ligne.daysBefore}
                        onChange={(e) => modifier(ligne.cle, { daysBefore: e.target.value })}
                        aria-label="Nombre de jours avant l'événement"
                        className="w-20 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition-all duration-300 focus:border-orange-200 focus:bg-white focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">jours</span>
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Combien
                </span>
                <div className="mt-1 flex gap-2">
                  <select
                    value={ligne.kind}
                    onChange={(e) => modifier(ligne.cle, { kind: e.target.value as Kind })}
                    className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition-all duration-300 focus:border-orange-200 focus:bg-white focus:outline-none"
                  >
                    <option value="percent">Pourcentage</option>
                    <option value="fixed">Montant fixe</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={ligne.kind === "percent" ? 0.5 : 1000}
                      value={ligne.kind === "percent" ? ligne.percent : ligne.fixedAmount}
                      onChange={(e) =>
                        modifier(
                          ligne.cle,
                          ligne.kind === "percent"
                            ? { percent: e.target.value }
                            : { fixedAmount: e.target.value },
                        )
                      }
                      aria-label={ligne.kind === "percent" ? "Pourcentage" : "Montant en francs"}
                      className="w-28 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition-all duration-300 focus:border-orange-200 focus:bg-white focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">
                      {ligne.kind === "percent" ? "%" : "FCFA"}
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>
        ))}

        {solde ? (
          <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Wallet className="h-4 w-4 text-teal-600" aria-hidden />
                Solde
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={solde.daysBefore}
                  onChange={(e) => modifier(solde.cle, { daysBefore: e.target.value })}
                  aria-label="Nombre de jours avant l'événement pour le solde"
                  className="w-20 rounded-xl border border-teal-100 bg-white px-3 py-2 text-sm text-slate-900 transition-all duration-300 focus:border-teal-300 focus:outline-none"
                />
                <span className="text-xs text-slate-600">jours avant l&apos;événement</span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Le solde vaut <strong>tout ce qui reste</strong> après les échéances ci-dessus. C&apos;est
              lui qui garantit que vous réclamez exactement le montant du devis, au franc près.
              Il ne peut être ni supprimé, ni déplacé.
            </p>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={ajouter}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Ajouter une échéance
      </button>

      {/* Aperçu — même calcul que la base, sur un montant d'exemple. */}
      <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Ce que verra votre client</h3>
          <div className="flex gap-1">
            {EXEMPLES.map((montant) => (
              <button
                key={montant}
                type="button"
                onClick={() => setExemple(montant)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 active:scale-[0.97] ${
                  exemple === montant
                    ? "bg-orange-500 text-white"
                    : "bg-white text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                }`}
              >
                {format(money(montant, "XOF"), { withCurrency: false })}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-3 space-y-1.5">
          {apercu.map((echeance) => (
            <li
              key={echeance.position}
              className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm"
            >
              <span className="text-slate-600">
                {echeance.label}
                <span className="text-slate-400">
                  {echeance.trigger === "booking"
                    ? " · à la réservation"
                    : ` · ${echeance.daysBefore} jours avant`}
                </span>
              </span>
              <span className="font-bold text-slate-900">{format(echeance.amount)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
          Total réclamé :{" "}
          <strong className="text-slate-900">
            {format(money(apercu.reduce((t, e) => t + e.amount.amount, 0), "XOF"))}
          </strong>{" "}
          sur {format(money(exemple, "XOF"))}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Enregistrement…
            </>
          ) : (
            "Enregistrer mes conditions"
          )}
        </Button>

        {state.message ? (
          <p
            role="status"
            className={`text-sm ${state.ok ? "text-teal-700" : "text-slate-700"}`}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Ces conditions s&apos;appliquent aux <strong>prochaines commandes</strong>. Celles déjà
        passées gardent l&apos;échéancier en vigueur au moment où le client a accepté votre devis.
      </p>
    </form>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-xl border border-slate-100 p-2 text-slate-500 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
