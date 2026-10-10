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
 *
 * ⚠️ **Cette table ne nomme que des lots à venir.** Les lots numérotés 1 à 8 du
 * plan d'origine sont livrés ou dissous ; un écran qui annonçait « arrive au
 * lot 2 » alors que le lot 2 est en production depuis des semaines dit au
 * lecteur que le produit est à l'arrêt. Les lots restants sont donc lettrés,
 * pour qu'aucune confusion ne soit possible avec l'ancienne numérotation, et
 * leur contenu est détaillé dans `docs/LOTS.md` — **qui doit rester d'accord
 * avec cette table.**
 */

/** Lot livrant chaque préfixe de route. Du plus spécifique au plus général. */
const LOT_BY_PREFIX: { prefix: string; lot: string }[] = [
  // — Espace partenaire —
  // `/pro/avis` est livré (lot A).
  { prefix: "/pro/finances/factures", lot: "Lot B — Facturation" },
  { prefix: "/pro/finances/commissions", lot: "Lot B — Facturation" },
  { prefix: "/pro/promotions", lot: "Lot D — Confort" },
  { prefix: "/pro", lot: "Lot D — Confort" },

  // — Espace entreprise —
  // Ses trois écrans manquants tiennent tous à la facture : une entreprise
  // rend des comptes, là où un particulier garde un reçu.
  { prefix: "/entreprise/reservations", lot: "Lot B — Facturation" },
  { prefix: "/entreprise/factures", lot: "Lot B — Facturation" },
  { prefix: "/entreprise/rapports", lot: "Lot B — Facturation" },
  { prefix: "/entreprise", lot: "Lot B — Facturation" },

  // — Back-office —
  // Le lot C a livré comptes, référentiel, journal, rapports et interrupteurs.
  // Ce qui reste ici ne relève plus de l'administration des comptes.
  // `/admin/avis` est livré (lot A).
  { prefix: "/admin/litiges", lot: "Lot A — Confiance" },
  { prefix: "/admin/signalements", lot: "Lot A — Confiance" },
  { prefix: "/admin/reservations", lot: "Lot B — Facturation" },
  { prefix: "/admin/commissions", lot: "Lot B — Facturation" },
  { prefix: "/admin/cms", lot: "Lot E — Éditorial & SEO" },
  { prefix: "/admin/medias", lot: "Lot E — Éditorial & SEO" },
  { prefix: "/admin/promotions", lot: "Lot D — Confort" },
  { prefix: "/admin", lot: "Lot D — Confort" },

  // — Espace particulier —
  // ✅ Complet depuis le lot D : ses huit entrées de menu ont toutes leur
  // écran. Les replis ci-dessous ne couvrent plus que d'éventuelles
  // sous-routes à venir.
  { prefix: "/compte", lot: "Lot D — Confort" },
  { prefix: "/projets", lot: "Lot D — Confort" },
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
