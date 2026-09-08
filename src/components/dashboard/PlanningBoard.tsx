"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
} from "lucide-react";

import {
  applyPlanning,
  type PlanningState,
} from "@/app/(partner)/pro/(dashboard)/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { format as formatMoney, money, toMajor, type CurrencyCode, type Money } from "@/lib/money";
import {
  buildPlanningMonth,
  clampMonth,
  monthBounds,
  monthLabel,
  presetSelection,
  summarizeMonth,
  type PlanningDay,
  type SelectionPreset,
} from "@/lib/planning";
import type { AvailabilityRow, DayRule } from "@/lib/pricing";

/**
 * Planning et tarifs d'une annonce.
 *
 * La navigation entre les mois se fait côté client : les douze mois sont
 * chargés en une fois, changer de mois ne doit pas coûter un aller-retour.
 * En revanche le choix de l'annonce passe par l'URL, pour qu'un planning
 * ouvert reste le même après un rechargement.
 *
 * `today` est fourni par le serveur : appeler `new Date()` ici ferait diverger
 * le rendu serveur du rendu client au passage de minuit.
 */

interface ListingOption {
  id: string;
  title: string;
  status: string;
  isPaused: boolean;
}

interface PlanningBoardProps {
  listings: ListingOption[];
  listingId: string;
  minPrice: number | null;
  currency: CurrencyCode;
  dayRule: DayRule | null;
  availabilities: AvailabilityRow[];
  /** Clé `yyyy-MM-dd` du jour, calculée sur le serveur. */
  today: string;
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const PRESETS: { value: SelectionPreset; label: string }[] = [
  { value: "mois", label: "Tout le mois" },
  { value: "week-ends", label: "Week-ends" },
  { value: "semaine", label: "En semaine" },
];

export function PlanningBoard({
  listings,
  listingId,
  minPrice,
  currency,
  dayRule,
  availabilities,
  today,
}: PlanningBoardProps) {
  const router = useRouter();

  const todayDate = React.useMemo(() => parseKey(today), [today]);
  const bounds = React.useMemo(() => monthBounds(todayDate), [todayDate]);

  const [month, setMonth] = React.useState(() => bounds.first);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [state, formAction, pending] = React.useActionState<PlanningState, FormData>(
    applyPlanning,
    {},
  );

  const cells = React.useMemo(
    () => buildPlanningMonth(month, { availabilities, dayRule, currency, today: todayDate }),
    [month, availabilities, dayRule, currency, todayDate],
  );

  const stats = React.useMemo(() => summarizeMonth(cells, currency), [cells, currency]);

  function toggle(day: PlanningDay) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(day.key)) next.delete(day.key);
      else next.add(day.key);
      return next;
    });
  }

  function applyPreset(preset: SelectionPreset) {
    setSelected(new Set(presetSelection(cells, preset)));
  }

  function shiftMonth(step: number) {
    setMonth((current) =>
      clampMonth(new Date(current.getFullYear(), current.getMonth() + step, 1), todayDate),
    );
  }

  const canGoBack = month > bounds.first;
  const canGoForward = month < bounds.last;

  return (
    <div className="space-y-4">
      {listings.length > 1 ? (
        <Select
          aria-label="Annonce à planifier"
          value={listingId}
          onChange={(event) => router.push(`/pro/planning?annonce=${event.target.value}`)}
        >
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.title}
              {listing.status !== "approved" ? " — pas encore en ligne" : ""}
            </option>
          ))}
        </Select>
      ) : null}

      {!dayRule ? (
        <Note tone="warning">
          Cette annonce n&apos;a pas de tarif à la journée. Renseignez-le dans{" "}
          <Link href={`/pro/annonces/${listingId}`} className="font-bold underline">
            la fiche de l&apos;annonce
          </Link>{" "}
          pour que le planning propose un tarif par défaut, ou fixez le tarif date par date
          ci-dessous.
        </Note>
      ) : null}

      {stats.unset > 0 ? (
        <Note tone="info">
          <span className="font-bold">
            {stats.unset} date{stats.unset > 1 ? "s" : ""} non renseignée
            {stats.unset > 1 ? "s" : ""} ce mois-ci.
          </span>{" "}
          Une date non renseignée n&apos;apparaît dans aucune recherche : ouvrez-la pour
          qu&apos;on puisse la réserver.
        </Note>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => shiftMonth(-1)}
            disabled={!canGoBack}
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>

          <p className="font-bold capitalize text-slate-900">{monthLabel(month)}</p>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => shiftMonth(1)}
            disabled={!canGoForward}
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
          {selected.size > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Tout désélectionner
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {WEEKDAYS.map((label, index) => (
            <div key={index}>{label}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, index) =>
            day ? (
              <DayCell
                key={day.key}
                day={day}
                selected={selected.has(day.key)}
                onToggle={() => toggle(day)}
              />
            ) : (
              <div key={`vide-${index}`} />
            ),
          )}
        </div>

        <Legend />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ouvertes" value={String(stats.open)} tone="teal" />
        <Stat label="Réservées" value={String(stats.booked)} tone="orange" />
        <Stat label="Fermées" value={String(stats.closed)} tone="slate" />
        <Stat
          label="Recette possible"
          value={formatMoney(stats.potentialRevenue)}
          tone="teal"
          hint="Si toutes les dates ouvertes se réservaient"
        />
      </div>

      {/* La barre d'action colle en bas : sur mobile, la sélection se fait en
          haut de l'écran et les boutons doivent rester atteignables. */}
      {selected.size > 0 ? (
        <form
          action={formAction}
          className="sticky bottom-0 z-10 -mx-4 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] sm:mx-0 sm:rounded-2xl"
        >
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="dates" value={[...selected].sort().join(",")} />

          <p className="text-sm font-bold text-slate-900">
            {selected.size} date{selected.size > 1 ? "s" : ""} sélectionnée
            {selected.size > 1 ? "s" : ""}
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <label
                htmlFor="price"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                Tarif du jour (FCFA)
              </label>
              <Input
                id="price"
                name="price"
                inputMode="numeric"
                placeholder={
                  dayRule ? `Par défaut ${toMajor(money(dayRule.basePrice, currency))}` : "Ex. 150000"
                }
              />
            </div>

            <div className="flex flex-1 flex-wrap gap-2">
              <Button type="submit" name="action" value="open" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Ouvrir ces dates
              </Button>
              <Button
                type="submit"
                name="action"
                value="close"
                variant="outline"
                disabled={pending}
              >
                <CalendarOff className="h-4 w-4" aria-hidden />
                Fermer
              </Button>
              <Button
                type="submit"
                name="action"
                value="reset-price"
                variant="ghost"
                disabled={pending}
              >
                Revenir au tarif de base
              </Button>
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Laissez le tarif vide pour conserver celui déjà fixé.
            {minPrice != null
              ? ` Votre prix plancher est de ${formatMoney(money(minPrice, currency))}.`
              : ""}
          </p>

          {state.message ? (
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
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------

function DayCell({
  day,
  selected,
  onToggle,
}: {
  day: PlanningDay;
  selected: boolean;
  onToggle: () => void;
}) {
  const base =
    "flex h-14 flex-col items-center justify-center rounded-xl border text-center transition-all duration-200 sm:h-16";

  const tone = day.isPast
    ? "border-transparent bg-transparent text-slate-300"
    : day.state === "booked"
      ? "border-orange-200 bg-orange-100 text-orange-800"
      : day.state === "open"
        ? "border-teal-200 bg-teal-50 text-teal-900 hover:border-teal-300"
        : day.state === "closed"
          ? "border-slate-200 bg-slate-100 text-slate-400 hover:border-slate-300"
          : "border-dashed border-slate-200 bg-white text-slate-400 hover:border-orange-200 hover:bg-orange-50";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!day.editable}
      aria-pressed={selected}
      aria-label={`${day.date.getDate()} — ${STATE_LABELS[day.state]}`}
      className={`${base} ${tone} ${
        selected ? "ring-2 ring-orange-500 ring-offset-1" : ""
      } ${day.editable ? "active:scale-[0.97]" : "cursor-not-allowed"}`}
    >
      <span className="text-sm font-bold">{day.date.getDate()}</span>
      {day.price && !day.isPast ? (
        <span className="text-[10px] font-medium tabular-nums">{shortAmount(day.price)}</span>
      ) : null}
    </button>
  );
}

const STATE_LABELS: Record<PlanningDay["state"], string> = {
  open: "ouvert à la réservation",
  closed: "fermé",
  booked: "déjà réservé",
  unset: "non renseigné",
};

function Legend() {
  const items = [
    { label: "Ouvert", className: "border-teal-200 bg-teal-50" },
    { label: "Réservé", className: "border-orange-200 bg-orange-100" },
    { label: "Fermé", className: "border-slate-200 bg-slate-100" },
    { label: "Non renseigné", className: "border-dashed border-slate-200 bg-white" },
  ];

  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded border ${item.className}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const STAT_TONES = {
  teal: "text-teal-700",
  orange: "text-orange-600",
  slate: "text-slate-600",
} as const;

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TONES;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${STAT_TONES[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-orange-200 bg-orange-50 text-orange-900"
      }`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** « 150k » tient dans une case de calendrier ; « 150 000 FCFA » non. */
function shortAmount(amount: Money): string {
  const major = toMajor(amount);
  return major >= 1000 ? `${Math.round(major / 1000)}k` : String(major);
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
