import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getFilterOptions } from "@/lib/listings";

export const metadata = {
  title: "Toutes les catégories",
  description:
    "Lieux, restauration, ambiance, animation, logistique, image, conseil et beauté : tous les métiers de l'événement au Bénin.",
};

export default async function CategoriesPage() {
  const { categoryGroups } = await getFilterOptions();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Tous les métiers de l&apos;événement
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Du lieu au dernier détail : parcourez les catégories pour trouver le prestataire
          qu&apos;il vous faut.
        </p>
      </header>

      <div className="space-y-10">
        {categoryGroups.map((family) => (
          <section key={family.slug}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900">{family.name}</h2>
              <Link
                href={`/categories/${family.slug}`}
                className="flex shrink-0 items-center gap-1 text-sm font-medium text-orange-600 hover:underline"
              >
                Tout voir
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {family.children.map((child) => (
                <li key={child.slug}>
                  <Link
                    href={`/categories/${child.slug}`}
                    className="block rounded-2xl border border-slate-100 bg-white p-4 font-medium text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
