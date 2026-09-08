"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CustomDatePicker } from "@/components/shared/CustomDatePicker";
import { toKey, type DateRange } from "@/lib/calendar";
import {
  activeFilterCount,
  buildSearchUrl,
  clearFilters,
  parseFilters,
  toggleAmenity,
  withFilter,
  type SearchFilters as Filters,
} from "@/lib/search";
import { cn } from "@/lib/utils";

interface Option {
  slug: string;
  name: string;
}

interface CategoryGroup extends Option {
  children: Option[];
}

interface SearchFiltersProps {
  cities: Option[];
  categoryGroups: CategoryGroup[];
  amenities: (Option & { applies_to: string | null })[];
  /** Chemin sur lequel republier les filtres (`/recherche`, `/lieux`…). */
  pathname?: string;
}

export function SearchFilters({
  cities,
  categoryGroups,
  amenities,
  pathname = "/recherche",
}: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = React.useState(false);

  const filters = parseFilters(searchParams);
  const count = activeFilterCount(filters);

  const apply = React.useCallback(
    (next: Filters) => {
      router.push(buildSearchUrl(next, pathname), { scroll: false });
    },
    [router, pathname],
  );

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    apply(withFilter(filters, key, value));

  const relevantAmenities = amenities.filter(
    (a) => !filters.kind || !a.applies_to || a.applies_to === filters.kind,
  );

  const dateRange: DateRange | undefined = filters.from
    ? { from: parseKey(filters.from), to: filters.to ? parseKey(filters.to) : undefined }
    : undefined;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <p className="flex items-center gap-2 font-bold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-orange-500" aria-hidden />
          Filtres
          {count > 0 ? (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600">
              {count}
            </span>
          ) : null}
        </p>

        <div className="flex items-center gap-2">
          {count > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => apply(clearFilters())}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Effacer
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? "Masquer" : "Afficher"}
          </Button>
        </div>
      </div>

      <div className={cn("space-y-5 p-4", isOpen ? "block" : "hidden lg:block")}>
        <div>
          <Label htmlFor="filtre-q">Mot-clé</Label>
          <Input
            id="filtre-q"
            defaultValue={filters.q ?? ""}
            placeholder="Salle, traiteur, décoration…"
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              if (value !== (filters.q ?? "")) set("q", value || undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </div>

        <div>
          <Label htmlFor="filtre-ville">Ville</Label>
          <Select
            id="filtre-ville"
            value={filters.city ?? ""}
            onChange={(e) => set("city", e.target.value || undefined)}
          >
            <option value="">Toutes les villes</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.name}>
                {city.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="filtre-categorie">Catégorie</Label>
          <Select
            id="filtre-categorie"
            value={filters.category ?? ""}
            onChange={(e) => set("category", e.target.value || undefined)}
          >
            <option value="">Toutes les catégories</option>
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
          </Select>
        </div>

        <div>
          <Label>Dates</Label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <CustomDatePicker
              mode="range"
              value={dateRange}
              placeholder="Quand ?"
              onChange={(range) => {
                apply({
                  ...filters,
                  from: range.from ? toKey(range.from) : undefined,
                  to: range.to ? toKey(range.to) : undefined,
                  page: 1,
                });
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <Label htmlFor="filtre-invites">Nombre d&apos;invités</Label>
            <Input
              id="filtre-invites"
              type="number"
              min={1}
              defaultValue={filters.guests ?? ""}
              placeholder="200"
              onBlur={(e) => {
                const value = Number.parseInt(e.currentTarget.value, 10);
                set("guests", Number.isFinite(value) && value > 0 ? value : undefined);
              }}
            />
          </div>

          <div>
            <Label htmlFor="filtre-budget">Budget maximum (FCFA)</Label>
            <Input
              id="filtre-budget"
              type="number"
              min={0}
              defaultValue={filters.budgetMax ?? ""}
              placeholder="500000"
              onBlur={(e) => {
                const value = Number.parseInt(e.currentTarget.value, 10);
                set("budgetMax", Number.isFinite(value) && value > 0 ? value : undefined);
              }}
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">Mode de réservation</legend>
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
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
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

        {relevantAmenities.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900">Équipements</legend>
            <div className="flex flex-wrap gap-2">
              {relevantAmenities.map((amenity) => {
                const active = filters.amenities.includes(amenity.slug);
                return (
                  <button
                    key={amenity.slug}
                    type="button"
                    onClick={() => apply(toggleAmenity(filters, amenity.slug))}
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
        ) : null}
      </div>
    </div>
  );
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
