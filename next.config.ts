import type { NextConfig } from "next";

/**
 * En-têtes de sécurité.
 *
 * Ce fichier était vide : la production ne servait **aucun** en-tête de
 * sécurité, hors le HSTS que Vercel pose de lui-même. Audit du 8 octobre 2026.
 *
 * Le risque concret n'était pas théorique : `/admin` valide des annonces et
 * déclenche des remboursements, et rien n'empêchait de l'encadrer dans une
 * iframe invisible posée sur un site tiers. Un administrateur connecté croit
 * cliquer sur un bouton anodin et valide en réalité ce que l'attaquant a mis
 * sous son curseur.
 */

/**
 * ⚠️ **Pourquoi pas de `Content-Security-Policy` complète ici.**
 *
 * Une CSP stricte sur l'App Router exige un `nonce` propagé à chaque script
 * injecté par Next, ce qui se règle dans le proxy et se vérifie écran par
 * écran. Posée à l'aveugle, elle casse l'hydratation — c'est-à-dire tout le
 * site — sans qu'aucun test ne le voie, puisque le HTML, lui, est rendu.
 *
 * Elle apporterait une seconde ligne de défense contre l'injection de script.
 * Le dépôt n'en a aujourd'hui aucune de première ligne à rattraper : il ne
 * contient pas un seul `dangerouslySetInnerHTML`, et une règle l'interdit. La
 * CSP est donc un chantier à part, pas une rustine à poser dans la foulée.
 *
 * `frame-ancestors` fait exception et figure ci-dessous : cette directive ne
 * concerne que l'encadrement, ne peut rien casser dans la page, et c'est elle
 * qui ferme le détournement de clic. Elle double `X-Frame-Options`, que les
 * navigateurs anciens sont seuls à lire encore.
 */
const EN_TETES = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },

  // Empêche un navigateur de « deviner » qu'un fichier déposé par un partenaire
  // est en réalité du HTML, et de l'exécuter comme tel.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // ⚠️ Sans cela, l'URL complète part chez le site visité ensuite — or nos URL
  // portent des références de commande, des identifiants de demande et le
  // paramètre `suivant`. `strict-origin-when-cross-origin` n'envoie que
  // l'origine au dehors, et garde le chemin entier en interne.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Rien de tout cela n'est utilisé par le produit. Le refuser d'avance évite
  // qu'un script tiers s'en serve un jour sans qu'on l'ait décidé.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Annonce la version du cadriciel à qui demande. Information gratuite pour
  // qui cherche une vulnérabilité connue ; aucune utilité pour nous.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: EN_TETES }];
  },
};

export default nextConfig;
