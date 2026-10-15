import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/utils/supabase/server";

/**
 * Plan du site.
 *
 * ⚠️ **Il n'y en avait aucun.** `/sitemap.xml` rendait un 404, alors que le
 * proxy l'exclut nommément — on le croyait présent. Sans lui, un moteur
 * découvre les fiches annonce au hasard de ses liens, et une fiche publiée
 * aujourd'hui peut attendre des semaines.
 *
 * Cela déborde du référencement : **l'icône qu'un moteur affiche dans ses
 * suggestions vient de son index**, et cet index ne bouge qu'à la
 * ré-exploration. C'est le seul levier que nous ayons dessus.
 *
 * **Le contenu vient de la base, jamais d'une liste écrite à la main** : une
 * liste figée omettrait chaque annonce publiée depuis sa rédaction, et
 * continuerait d'annoncer celles qui ont été retirées. Un plan de site qui
 * ment coûte plus cher que pas de plan du tout.
 *
 * ⚠️ **Lecture par le client public, pas par la clé de service.** La RLS
 * n'expose que les annonces validées et non suspendues : c'est exactement ce
 * qui doit figurer ici, et s'en remettre à elle évite de recopier la condition
 * — donc de la laisser diverger. Une annonce en brouillon ne peut pas se
 * glisser dans le plan, même par erreur de requête.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const supabase = await createClient();

  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/recherche`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/lieux`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/prestataires`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/demande-de-devis`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.3 },
    // Pages légales : rarement modifiées, mais leur présence dans l'index est
    // un signal de sérieux pour une place de marché qui encaisse.
    { url: `${base}/mentions-legales`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/conditions-generales`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/confidentialite`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const [{ data: annonces }, { data: categories }] = await Promise.all([
    supabase
      .from("listing_search")
      .select("slug, kind, published_at")
      .eq("status", "approved")
      .eq("is_paused", false),
    supabase.from("categories").select("slug").eq("is_active", true),
  ]);

  // ⚠️ `/lieux/…` pour un lieu, `/prestataires/…` pour un service : les deux
  // fiches se rendent par le même composant, mais chacune a **une seule** URL
  // canonique — l'autre redirige. Se tromper de préfixe mettrait dans le plan
  // une adresse qui renvoie un 307, ce qu'un moteur compte comme un défaut.
  const fiches: MetadataRoute.Sitemap = (annonces ?? [])
    .filter((a) => a.slug)
    .map((a) => ({
      url: `${base}/${a.kind === "venue" ? "lieux" : "prestataires"}/${a.slug}`,
      lastModified: a.published_at ? new Date(a.published_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const familles: MetadataRoute.Sitemap = (categories ?? [])
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${base}/categories/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

  return [...pages, ...fiches, ...familles];
}
