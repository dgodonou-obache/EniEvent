"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { List, Map as MapIcon, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { buildSearchUrl, clearFilters, parseFilters, SORTS } from "@/lib/search";
import { cn } from "@/lib/utils";

import { ListingCard, type ListingCardData } from "./ListingCard";

// Leaflet touche à `window` : il ne doit jamais être rendu côté serveur.
const ResultsMap = dynamic(() => import("./ResultsMap").then((m) => m.ResultsMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-500">
      Chargement de la carte…
    </div>
  ),
});

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  pertinence: "Pertinence",
  "prix-croissant": "Prix croissant",
  "prix-decroissant": "Prix décroissant",
  note: "Meilleures notes",
};

interface SearchResultsProps {
  listings: (ListingCardData & { latitude?: number | null; longitude?: number | null })[];
  total: number;
  page: number;
  pageCount: number;
  pathname?: string;
}

export function SearchResults({
  listings,
  total,
  page,
  pageCount,
  pathname = "/recherche",
}: SearchResultsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseFilters(searchParams);
  const [view, setView] = React.useState<"liste" | "carte">("liste");

  if (total === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Aucun résultat pour cette recherche"
        description="Essayez d'élargir les dates, d'augmenter le budget ou de retirer un filtre. Vous pouvez aussi décrire votre projet et laisser les prestataires vous répondre."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => router.push(buildSearchUrl(clearFilters(), pathname))}>
              Effacer les filtres
            </Button>
            <Link href="/demande-de-devis">
              <Button variant="outline" className="w-full sm:w-auto">
                Demander un devis
              </Button>
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-bold text-slate-900">{total}</span>{" "}
          {total > 1 ? "résultats" : "résultat"}
        </p>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 p-0.5">
            {(["liste", "carte"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  view === mode
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-600 hover:text-orange-600",
                )}
              >
                {mode === "liste" ? (
                  <List className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <MapIcon className="h-3.5 w-3.5" aria-hidden />
                )}
                {mode === "liste" ? "Liste" : "Carte"}
              </button>
            ))}
          </div>

          <Select
            aria-label="Trier les résultats"
            className="h-9 w-auto min-w-[11rem] text-xs"
            value={filters.sort}
            onChange={(e) =>
              router.push(
                buildSearchUrl({ ...filters, sort: e.target.value as never, page: 1 }, pathname),
                { scroll: false },
              )
            }
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {view === "carte" ? (
        <ResultsMap listings={listings} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.slug} listing={listing} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
          <Link
            href={buildSearchUrl({ ...filters, page: page - 1 }, pathname)}
            aria-disabled={page <= 1}
            className={cn(page <= 1 && "pointer-events-none opacity-40")}
          >
            <Button variant="outline" size="sm">
              Précédent
            </Button>
          </Link>

          <span className="px-3 text-sm text-slate-500">
            Page {page} sur {pageCount}
          </span>

          <Link
            href={buildSearchUrl({ ...filters, page: page + 1 }, pathname)}
            aria-disabled={page >= pageCount}
            className={cn(page >= pageCount && "pointer-events-none opacity-40")}
          >
            <Button variant="outline" size="sm">
              Suivant
            </Button>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
