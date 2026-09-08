"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, Search, SlidersHorizontal, Tag, Users } from "lucide-react";

import { CustomDatePicker } from "@/components/shared/CustomDatePicker";
import { Button } from "@/components/ui/button";
import { toKey, type DateRange } from "@/lib/calendar";
import { buildSearchUrl, clearFilters, type SearchFilters } from "@/lib/search";
import { cn } from "@/lib/utils";

interface Option {
  slug: string;
  name: string;
}

interface HeroSearchProps {
  cities: Option[];
  categoryGroups: (Option & { children: Option[] })[];
  amenities: (Option & { applies_to: string | null })[];
}

/**
 * Recherche de la page d'accueil.
 *
 * Les quatre critères décisifs — quoi, où, quand, combien — sont visibles
 * d'emblée. Les filtres secondaires (budget, mode de réservation, équipements)
 * sont dépliables : les imposer d'entrée transformerait la promesse « trouvez
 * votre lieu » en formulaire administratif.
 *
 * Aucun état n'est partagé avec `/recherche` : ce composant construit une URL
 * et navigue. C'est `search.ts` qui la relit ensuite, donc les deux ne peuvent
 * pas diverger.
 */
export function HeroSearch({ cities, categoryGroups, amenities }: HeroSearchProps) {
  const router = useRouter();
  const [advanced, setAdvanced] = React.useState(false);
  const [filters, setFilters] = React.useState<SearchFilters>(clearFilters);
  const [range, setRange] = React.useState<DateRange | undefined>();

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(
      buildSearchUrl({
        ...filters,
        from: range?.from ? toKey(range.from) : undefined,
        to: range?.to ? toKey(range.to) : undefined,
      }),
    );
  }

  const toggleAmenity = (slug: string) =>
    set(
      "amenities",
      filters.amenities.includes(slug)
        ? filters.amenities.filter((a) => a !== slug)
        : [...filters.amenities, slug],
    );

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-100 bg-white/95 p-2 backdrop-blur sm:p-3"
      role="search"
      aria-label="Rechercher un lieu ou un prestataire"
    >
      <div className="grid gap-2 lg:grid-cols-[1.3fr_1fr_1.1fr_0.8fr_auto]">
        <Field icon={Tag} label="Quoi" htmlFor="hero-categorie">
          <select
            id="hero-categorie"
            value={filters.category ?? ""}
            onChange={(e) => set("category", e.target.value || undefined)}
            className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
          >
            <option value="">Tout type de prestation</option>
            {categoryGroups.map((family) => (
              <optgroup key={family.slug} label={family.name}>
                <option value={family.slug}>Tout {family.name.toLowerCase()}</option>
                {family.children.map((child) => (
                  <option key={child.slug} value={child.slug}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field icon={MapPin} label="Où" htmlFor="hero-ville">
          <select
            id="hero-ville"
            value={filters.city ?? ""}
            onChange={(e) => set("city", e.target.value || undefined)}
            className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
          >
            <option value="">Partout au Bénin</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.name}>
                {city.name}
              </option>
            ))}
          </select>
        </Field>

        <Field icon={CalendarDays} label="Quand" htmlFor="hero-dates">
          <CustomDatePicker
            mode="range"
            value={range}
            onChange={setRange}
            placeholder="Vos dates"
            aria-label="Choisir les dates"
          />
        </Field>

        <Field icon={Users} label="Invités" htmlFor="hero-invites">
          <input
            id="hero-invites"
            type="number"
            min={1}
            placeholder="200"
            value={filters.guests ?? ""}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              set("guests", Number.isFinite(value) && value > 0 ? value : undefined);
            }}
            className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          />
        </Field>

        <Button type="submit" size="lg" className="lg:h-full lg:px-7">
          <Search className="h-4 w-4" aria-hidden />
          <span className="lg:sr-only xl:not-sr-only">Rechercher</span>
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-2 pb-1">
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-orange-600"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {advanced ? "Moins de filtres" : "Plus de filtres"}
        </button>

        {filters.amenities.length > 0 ? (
          <span className="text-xs text-slate-400">
            {filters.amenities.length} équipement{filters.amenities.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {advanced ? (
        <div className="animate-slide-up space-y-4 border-t border-slate-100 px-2 pb-2 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="hero-budget"
                className="mb-1.5 block text-xs font-bold text-slate-900"
              >
                Budget maximum (FCFA)
              </label>
              <input
                id="hero-budget"
                type="number"
                min={0}
                placeholder="500 000"
                value={filters.budgetMax ?? ""}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value, 10);
                  set("budgetMax", Number.isFinite(value) && value > 0 ? value : undefined);
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm transition-all duration-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-bold text-slate-900">
                Mode de réservation
              </legend>
              <div className="flex gap-2">
                {[
                  { value: undefined, label: "Peu importe" },
                  { value: "instant" as const, label: "Immédiate" },
                  { value: "quote" as const, label: "Sur devis" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => set("bookingMode", option.value)}
                    aria-pressed={filters.bookingMode === option.value}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                      filters.bookingMode === option.value
                        ? "border-orange-200 bg-orange-50 text-orange-600"
                        : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-slate-900">Équipements</legend>
            <div className="flex flex-wrap gap-2">
              {amenities.slice(0, 10).map((amenity) => {
                const active = filters.amenities.includes(amenity.slug);
                return (
                  <button
                    key={amenity.slug}
                    type="button"
                    onClick={() => toggleAmenity(amenity.slug)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                      active
                        ? "border-orange-200 bg-orange-50 text-orange-600"
                        : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50",
                    )}
                  >
                    {amenity.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </form>
  );
}

function Field({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group rounded-xl px-3 py-2.5 transition-colors duration-300 hover:bg-orange-50 focus-within:bg-orange-50">
      <label htmlFor={htmlFor} className="micro-label mb-1 block text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-orange-500 group-hover:text-orange-500"
          aria-hidden
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
