import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

/**
 * Instructions aux robots d'indexation.
 *
 * ⚠️ **Il n'y en avait aucune.** `/robots.txt` rendait un 404 — alors que le
 * proxy l'exclut nommément de son filtre depuis toujours, signe qu'on le
 * croyait présent. Son absence ne bloquait rien (un robot sans consigne
 * explore tout), mais elle privait les moteurs du seul moyen conventionnel de
 * trouver le plan du site.
 *
 * Cela compte au-delà du référencement : **l'icône affichée par un moteur dans
 * ses suggestions vient de son propre index**, et cet index ne se rafraîchit
 * qu'à la ré-exploration. Mesuré le 15 octobre 2026, le service d'icônes de
 * Google rendait encore un ancien logo pour `enievent.com` — ni le nôtre, ni
 * celui de Vercel. Guider les robots est ce que nous pouvons faire ; le reste
 * est leur calendrier.
 *
 * **Les cinq espaces authentifiés sont exclus.** Ils exigent une session et ne
 * rendraient qu'une page de connexion à un robot — autant de pages creuses
 * dans l'index, et autant d'exploration dépensée pour rien. `/api` et `/auth`
 * de même : ce ne sont pas des pages.
 *
 * ⚠️ Un `Disallow` n'est **pas** une mesure de sécurité : il demande poliment
 * de ne pas explorer, et le fichier est public, donc il **nomme** les chemins
 * qu'il écarte. Ce qui protège ces espaces est le proxy et la RLS, pas ceci.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/pro",
          "/compte",
          "/entreprise",
          "/projets",
          "/api/",
          "/auth/",
          // Page de refus : utile à l'utilisateur, sans intérêt pour un index.
          "/acces-refuse",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
