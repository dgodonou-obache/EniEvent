import { NAV_BY_SPACE, type NavItem, type Space } from "./nav-config";

export { NAV_BY_SPACE, type Space };

/**
 * Feuille de route des back-offices.
 *
 * Sert aux écrans d'attente : plutôt qu'un 404 qui fait douter de
 * l'installation, chaque route non encore construite dit à quel lot elle
 * arrive et ce qu'elle contiendra. Les vraies pages, plus spécifiques, priment
 * automatiquement sur la route attrape-tout — cette table se vide donc d'
 * elle-même à mesure que les lots sont livrés.
 */

/** Lot livrant chaque préfixe de route. Du plus spécifique au plus général. */
const LOT_BY_PREFIX: { prefix: string; lot: string }[] = [
  { prefix: "/pro/demandes", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/pro/devis", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/pro/messages", lot: "Lot 6 — Confiance" },
  { prefix: "/pro/avis", lot: "Lot 6 — Confiance" },
  { prefix: "/pro/finances", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/pro/reservations", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/pro", lot: "Lot 3 — Back-office partenaire" },

  { prefix: "/entreprise/devis", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/entreprise/projets", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/entreprise/reservations", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/entreprise/factures", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/entreprise", lot: "Lot 5 — Espace entreprise" },

  { prefix: "/admin/moderation", lot: "Lot 3 — Boucle de l'offre" },
  { prefix: "/admin/partenaires", lot: "Lot 3 — Boucle de l'offre" },
  { prefix: "/admin/paiements", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/admin/versements", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/admin/remboursements", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/admin/litiges", lot: "Lot 6 — Confiance" },
  { prefix: "/admin/avis", lot: "Lot 6 — Confiance" },
  { prefix: "/admin/demandes", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/admin/projets", lot: "Lot 4 — Tunnel de devis" },
  { prefix: "/admin", lot: "Lot 7 — Back-office & ops" },

  // Espace particulier. Ses écrans suivent le client, pas un métier : ils
  // arrivent donc avec le lot qui crée la donnée qu'ils affichent.
  { prefix: "/compte/reservations", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/compte/paiements", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/compte/documents", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/compte/messages", lot: "Lot 6 — Confiance" },
  { prefix: "/compte/favoris", lot: "Lot 8 — Éditorial & SEO" },
  { prefix: "/compte/profil", lot: "Lot 3 — Comptes & paramètres" },
  { prefix: "/compte", lot: "Lot 2 — Chaîne financière" },
  { prefix: "/projets", lot: "Lot 4 — Tunnel de devis" },
];

export function lotFor(pathname: string): string {
  return (
    LOT_BY_PREFIX.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
      ?.lot ?? "À planifier"
  );
}

/** Retrouve l'entrée de menu correspondant à une route, pour en tirer le titre. */
export function navItemFor(space: Space, pathname: string): NavItem | undefined {
  const items = NAV_BY_SPACE[space].sections.flatMap((section) => section.items);

  // Le plus long préfixe l'emporte : `/pro/finances/versements` ne doit pas
  // être attribué à `/pro/finances` s'il a sa propre entrée.
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
