import { SearchFilters } from "@/components/marketplace/SearchFilters";
import { SearchResults } from "@/components/marketplace/SearchResults";
import { getFilterOptions, searchListings } from "@/lib/listings";
import { parseFilters, type Kind } from "@/lib/search";

interface CatalogPageProps {
  title: string;
  intro: string;
  /** Nature imposée par la page : `/lieux` ne montre pas de traiteurs. */
  kind?: Kind;
  /** Catégorie imposée, pour les pages `/categories/[slug]`. */
  category?: string;
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Corps commun aux catalogues : `/lieux`, `/prestataires` et les pages
 * catégorie ne diffèrent que par leur titre et le filtre qu'elles imposent.
 */
export async function CatalogPage({
  title,
  intro,
  kind,
  category,
  pathname,
  searchParams,
}: CatalogPageProps) {
  // Le filtre imposé par la page prime sur celui de l'URL : on ne peut pas
  // faire apparaître un traiteur sur /lieux en trafiquant les paramètres.
  const filters = { ...parseFilters(searchParams), ...(kind ? { kind } : {}), ...(category ? { category } : {}) };

  const [{ cities, categoryGroups, amenities }, results] = await Promise.all([
    getFilterOptions(),
    searchListings(filters),
  ]);

  const relevantGroups = kind
    ? categoryGroups.filter((group) => group.kind === kind)
    : categoryGroups;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 max-w-2xl text-slate-500">{intro}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SearchFilters
            cities={cities}
            categoryGroups={relevantGroups}
            amenities={amenities}
            pathname={pathname}
          />
        </aside>

        <SearchResults
          listings={results.rows}
          total={results.total}
          page={results.page}
          pageCount={results.pageCount}
          pathname={pathname}
        />
      </div>
    </main>
  );
}
