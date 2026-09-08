"use client";

import * as React from "react";
import { addMonths, format, isSameDay, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

import {
  advanceRange,
  buildMonthGrid,
  isInRange,
  isSelectable,
  toggleDate,
  type AvailabilityOptions,
  type DateRange,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Calendrier maison, repris de la v1 et généralisé aux plages.
 *
 * Le `<input type="date">` natif est proscrit dans ce projet : son apparence est
 * imposée par le navigateur et ne permet ni de griser les dates fermées, ni
 * d'afficher un tarif par jour — deux besoins centraux ici.
 *
 * Toute la logique de dates vit dans `@/lib/calendar` ; ce fichier n'est que
 * l'affichage et le clavier.
 */

const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

interface CommonProps extends AvailabilityOptions {
  placeholder?: string;
  className?: string;
  alignRight?: boolean;
  disabled?: boolean;
  /** Tarif par jour, clé `yyyy-MM-dd`, affiché sous le numéro. */
  pricesByDate?: Record<string, string>;
  "aria-label"?: string;
}

type DatePickerProps =
  | (CommonProps & { mode?: "single"; value?: Date; onChange: (value: Date | undefined) => void })
  | (CommonProps & { mode: "multiple"; value?: Date[]; onChange: (value: Date[]) => void })
  | (CommonProps & { mode: "range"; value?: DateRange; onChange: (value: DateRange) => void });

export function CustomDatePicker(props: DatePickerProps) {
  const {
    placeholder = "Sélectionner une date",
    className,
    alignRight = false,
    disabled = false,
    pricesByDate,
    availableDates,
    minDate,
    maxDate,
    today,
  } = props;

  // On teste `props.mode` directement partout : passer par une variable
  // intermédiaire ferait perdre à TypeScript le rétrécissement de l'union, et
  // avec lui la garantie que `onChange` reçoit le bon type.
  const [isOpen, setIsOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => initialMonth(props));
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      // Rendre le focus au déclencheur : sans cela, la tabulation repart du
      // début de la page.
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const availability = { availableDates, minDate, maxDate, today };

  function handleSelect(date: Date) {
    if (props.mode === "multiple") {
      props.onChange(toggleDate(props.value ?? [], date));
      return;
    }

    if (props.mode === "range") {
      const next = advanceRange(props.value, date);
      props.onChange(next);
      // On ne referme qu'une fois la plage complète.
      if (next.to) setIsOpen(false);
      return;
    }

    props.onChange(date);
    setIsOpen(false);
  }

  function isSelected(date: Date): boolean {
    if (props.mode === "multiple") return (props.value ?? []).some((d) => isSameDay(d, date));
    if (props.mode === "range") return isInRange(date, props.value);
    return props.value ? isSameDay(props.value, date) : false;
  }

  const label = summarise(props, placeholder);
  const hasValue = label !== placeholder;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={props["aria-label"] ?? placeholder}
        className="group flex w-full items-center gap-3 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarIcon
          aria-hidden
          className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-orange-500"
        />
        <span
          className={cn(
            "flex-1 truncate text-sm font-medium md:text-base",
            hasValue ? "text-slate-900" : "text-slate-500",
          )}
        >
          {label}
        </span>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Choisir une date"
          className={cn(
            "absolute top-full z-50 mt-2 w-[300px] animate-slide-up rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-200/50",
            alignRight ? "right-0" : "left-0",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(subMonths(month, 1))}
              aria-label="Mois précédent"
              className="rounded-full p-1 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>

            <span aria-live="polite" className="font-bold capitalize text-slate-900">
              {format(month, "MMMM yyyy", { locale: fr })}
            </span>

            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Mois suivant"
              className="rounded-full p-1 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="flex h-8 items-center justify-center text-xs font-medium text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {buildMonthGrid(month).map((date, index) => {
              if (!date) return <div key={`vide-${index}`} className="h-10" />;

              const selectable = isSelectable(date, availability);
              const selected = isSelected(date);
              const price = pricesByDate?.[format(date, "yyyy-MM-dd")];

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  disabled={!selectable}
                  aria-pressed={selected}
                  aria-label={format(date, "EEEE d MMMM yyyy", { locale: fr })}
                  onClick={() => handleSelect(date)}
                  className={cn(
                    "mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm transition-colors",
                    !selectable && "cursor-not-allowed text-slate-300",
                    selectable && !selected && "text-slate-700 hover:bg-orange-50 hover:text-orange-600",
                    selected && "bg-orange-500 font-bold text-white",
                  )}
                >
                  <span className={cn(price && "leading-none")}>{date.getDate()}</span>
                  {price ? (
                    <span
                      className={cn(
                        "mt-0.5 text-[9px] leading-none",
                        selected ? "text-orange-50" : "text-slate-400",
                      )}
                    >
                      {price}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initialMonth(props: DatePickerProps): Date {
  if (props.mode === "multiple") return props.value?.[0] ?? new Date();
  if (props.mode === "range") return props.value?.from ?? new Date();
  return props.value ?? new Date();
}

function summarise(props: DatePickerProps, placeholder: string): string {
  if (props.mode === "multiple") {
    const dates = props.value ?? [];
    if (dates.length === 0) return placeholder;
    if (dates.length === 1) return format(dates[0], "dd/MM/yyyy");
    return `${dates.length} dates sélectionnées`;
  }

  if (props.mode === "range") {
    if (!props.value) return placeholder;
    if (!props.value.to) return `À partir du ${format(props.value.from, "dd/MM/yyyy")}`;
    return `${format(props.value.from, "dd/MM")} → ${format(props.value.to, "dd/MM/yyyy")}`;
  }

  return props.value ? format(props.value, "dd/MM/yyyy") : placeholder;
}
