import type { MetadataRoute } from "next";

/**
 * Manifeste d'application web.
 *
 * ⚠️ **Il existe pour les surfaces qui ne lisent pas les balises `<link>`.**
 * Android s'en sert pour l'icône d'écran d'accueil, et plusieurs moissonneurs
 * d'icônes — ceux qui alimentent les suggestions de recherche — le consultent
 * avant le HTML. Sans lui, ces surfaces retombent sur ce qu'elles ont en cache,
 * ce qui a donné sur iPhone une marque qui n'était pas la nôtre dans la liste
 * des suggestions, alors que le site ouvert affichait la bonne.
 *
 * ⚠️ **Pas de `display: "standalone"`, et c'est délibéré.** Il ferait s'ouvrir
 * le site sans barre d'adresse une fois ajouté à l'écran d'accueil. Sur une
 * plateforme où l'on règle des sommes réelles par Mobile Money, l'adresse
 * visible est un repère de confiance : c'est elle qui permet à quelqu'un de
 * vérifier qu'il est bien sur `enievent.com` avant de payer. On ne retire pas
 * ce repère sans une raison, et « ça fait plus application » n'en est pas une.
 *
 * `theme_color` est l'orange de la marque : il colore la barre système sur
 * Android. `background_color` reste blanc, comme le fond des icônes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ÉniEvent — Organisez vos événements au Bénin",
    short_name: "ÉniEvent",
    description:
      "Réservez salles, traiteurs, décorateurs, maîtres de cérémonie et matériel " +
      "événementiel à Cotonou, Porto-Novo, Abomey-Calavi et partout au Bénin.",
    start_url: "/",
    lang: "fr",
    theme_color: "#F97316",
    background_color: "#FFFFFF",
    icons: [
      { src: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      // Servi par la convention `src/app/icon.png` : pas de doublon dans
      // `public/`, qui coûterait 150 Ko pour le même fichier.
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
