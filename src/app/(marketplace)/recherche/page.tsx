import { Suspense } from "react";

import { SearchFilters } from "@/components/marketplace/SearchFilters";
import { SearchResults } from "@/components/marketplace/SearchResults";
import { Skeleton } from "@/components/ui/skeleton";
import { getFilterOptions, searchListings } from "@/lib/listings";
import { parseFilters } from "@/lib/search";

export const metadata = {
  title: "Rechercher un lieu ou un prestataire",
  description:
    "Salles, traiteurs, décoration, location d'équipement et animation à Cotonou, Porto-Novo, Abomey-Calavi et partout au Bénin.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [{ cities, categoryGroups, amenities }, results] = await Promise.all([
    getFilterOptions(),
    searchListings(filters),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {headingFor(filters)}
        </h1>
        <p className="mt-2 text-slate-500">
          Réservez immédiatement au prix affiché, ou demandez un devis.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Suspense fallback={<Skeleton className="h-96" />}>
            <SearchFilters
              cities={cities}
              categoryGroups={categoryGroups}
              amenities={amenities}
            />
          </Suspense>
        </aside>

        <Suspense fallback={<ResultsSkeleton />}>
          <SearchResults
            listings={results.rows}
            total={results.total}
            page={results.page}
            pageCount={results.pageCount}
          />
        </Suspense>
      </div>
    </main>
  );
}

function headingFor(filters: ReturnType<typeof parseFilters>): string {
  if (filters.q) return `« ${filters.q} »`;
  if (filters.city) return `Lieux et prestataires à ${filters.city}`;
  return "Lieux et prestataires au Bénin";
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-80" />
      ))}
    </div>
  );
}
