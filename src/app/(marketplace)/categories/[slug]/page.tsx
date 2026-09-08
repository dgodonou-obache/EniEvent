import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CatalogPage } from "@/components/marketplace/CatalogPage";
import { createClient } from "@/utils/supabase/server";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function getCategory(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name, description, kind, seo_title, seo_description")
    .eq("slug", slug)
    .maybeSingle();

  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) return { title: "Catégorie introuvable" };

  return {
    title: category.seo_title ?? `${category.name} au Bénin`,
    description:
      category.seo_description ??
      category.description ??
      `Trouvez un prestataire « ${category.name} » à Cotonou, Porto-Novo et partout au Bénin.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) notFound();

  return (
    <CatalogPage
      title={category.name}
      intro={
        category.description ??
        `Tous les prestataires « ${category.name.toLowerCase()} » disponibles au Bénin.`
      }
      category={category.slug}
      pathname={`/categories/${category.slug}`}
      searchParams={await searchParams}
    />
  );
}
