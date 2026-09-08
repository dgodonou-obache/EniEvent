"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, FileText, Info, Zap } from "lucide-react";

import { CustomDatePicker } from "@/components/shared/CustomDatePicker";
import { Button } from "@/components/ui/button";
import { toKey } from "@/lib/calendar";
import { format, money, type CurrencyCode } from "@/lib/money";
import { quote, type AvailabilityRow, type DayRule } from "@/lib/pricing";
import { UNIT_CATALOGUE_LABELS, type PriceUnit } from "@/lib/units";

interface BookingBoxProps {
  slug: string;
  title: string;
  bookingMode: string | null;
  currency: CurrencyCode;
  priceFrom: number | null;
  availabilities: AvailabilityRow[];
  dayRule: DayRule | null;
  /** Unité du tarif : une prestation au forfait ne se réserve pas à la journée. */
  priceUnit: string | null;
}


/**
 * Encart de réservation.
 *
 * Le prix affiché vient de `pricing.ts` : tarif du jour saisi par le
 * prestataire, ou tarif de base majoré le week-end. Les frais de service sont
 * montrés dès ici — les découvrir au paiement serait une mauvaise surprise.
 */
export function BookingBox({
  slug,
  bookingMode,
  currency,
  priceFrom,
  availabilities,
  dayRule,
  priceUnit,
}: BookingBoxProps) {
  const [dates, setDates] = React.useState<Date[]>([]);

  const openDates = React.useMemo(
    () => availabilities.filter((a) => a.status === "open").map((a) => a.date),
    [availabilities],
  );

  const pricesByDate = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of availabilities) {
      if (row.status !== "open" || row.price == null) continue;
      // Abrégé en milliers : « 150k » tient dans une case de calendrier.
      map[row.date] = `${Math.round(row.price / 1000)}k`;
    }
    return map;
  }, [availabilities]);

  const estimate = React.useMemo(
    () => quote(dates.map(toKey), { availabilities, dayRule, currency }),
    [dates, availabilities, dayRule, currency],
  );

  const canBookInstantly = bookingMode === "instant" || bookingMode === "both";
  const canRequestQuote = bookingMode === "quote" || bookingMode === "both";
  const isDatedOffer = dayRule !== null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5">
      {priceFrom != null ? (
        <p className="text-2xl font-bold text-slate-900">
          {format(money(priceFrom, currency))}
          <span className="ml-1.5 text-sm font-medium text-slate-500">
            {priceUnit ? (UNIT_CATALOGUE_LABELS[priceUnit as PriceUnit] ?? "") : ""}
          </span>
        </p>
      ) : (
        <p className="text-lg font-bold text-slate-900">Prix sur devis</p>
      )}

      {isDatedOffer ? (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-orange-500" aria-hidden />
            Vos dates
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <CustomDatePicker
              mode="multiple"
              value={dates}
              onChange={setDates}
              availableDates={openDates}
              pricesByDate={pricesByDate}
              placeholder="Choisir une ou plusieurs dates"
              aria-label="Choisir les dates de réservation"
            />
          </div>

          {dates.length > 0 && estimate.ok ? (
            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              {estimate.days.map((day) => (
                <div key={day.date} className="flex justify-between gap-3 text-slate-500">
                  <dt>
                    {new Date(day.date).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                    })}
                    {day.isWeekend ? (
                      <span className="ml-1.5 text-xs text-orange-600">week-end</span>
                    ) : null}
                  </dt>
                  <dd className="tabular-nums">{format(day.amount)}</dd>
                </div>
              ))}

              <div className="flex justify-between gap-3 border-t border-slate-100 pt-2 text-slate-500">
                <dt>Frais de service</dt>
                <dd className="tabular-nums">{format(estimate.serviceFee)}</dd>
              </div>

              <div className="flex justify-between gap-3 pt-1 text-base font-bold text-slate-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{format(estimate.total)}</dd>
              </div>
            </dl>
          ) : null}

          {dates.length > 0 && !estimate.ok ? (
            <p
              role="alert"
              className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {estimate.reason === "date-indisponible"
                ? "Une des dates choisies n'est plus disponible."
                : estimate.reason === "date-non-ouverte"
                  ? "Une des dates choisies n'est pas ouverte à la réservation."
                  : "Le tarif d'une des dates choisies n'est pas encore fixé. Demandez un devis."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {canBookInstantly ? (
          <Button className="w-full" disabled={isDatedOffer && dates.length === 0}>
            <Zap className="h-4 w-4" aria-hidden />
            {isDatedOffer && dates.length === 0 ? "Choisissez vos dates" : "Réserver"}
          </Button>
        ) : null}

        {canRequestQuote ? (
          <Link href={`/demande-de-devis?annonce=${slug}`} className="block">
            <Button variant={canBookInstantly ? "outline" : "default"} className="w-full">
              <FileText className="h-4 w-4" aria-hidden />
              Demander un devis
            </Button>
          </Link>
        ) : null}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Aucun montant ne vous est débité à cette étape.
      </p>
    </div>
  );
}
