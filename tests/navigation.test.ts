import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Liens de navigation et routes réellement construites.
 *
 * Un `href` pointant vers une route inexistante ne se voit **ni au typecheck,
 * ni au lint, ni au build** : `href` est une simple chaîne, que rien ne
 * confronte à l'arborescence de `src/app`. Le défaut n'apparaît qu'au clic, en
 * production, sous la forme d'un « This page could not be found ».
 *
 * C'est arrivé au bouton « Devenir partenaire » de l'en-tête, qui visait
 * `/devenir-partenaire` quand la page vit en `/pro/inscription` — le pied de
 * page, lui, pointait juste. Un lien mort dans la barre de navigation fait
 * douter de toute l'installation.
 *
 * Ce contrôle relit les liens de l'en-tête et du pied de page et exige que
 * chacun corresponde à une route existante.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const appDir = fileURLToPath(new URL("../src/app/", import.meta.url));

const NAVIGATION_FILES = [
  "src/components/layout/PublicHeader.tsx",
  "src/components/layout/PublicFooter.tsx",
];

/** Routes de l'App Router, groupes `(public)` retirés — ils ne créent pas d'URL. */
function routes(dir: string, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Un segment entre parenthèses organise les dossiers sans peser sur l'URL.
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      found.push(...routes(join(dir, entry.name), prefix + segment));
    } else if (entry.name === "page.tsx") {
      found.push(prefix === "" ? "/" : prefix);
    }
  }

  return found;
}

/** `/lieux/[slug]` accepte `/lieux/salle-etoile` ; `/pro/[...segments]` accepte la suite. */
function matches(route: string, href: string): boolean {
  const pattern = route
    .split("/")
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
      if (/^\[.+\]$/.test(segment)) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return new RegExp(`^${pattern}$`).test(href);
}

describe("liens de navigation", () => {
  const known = routes(appDir);

  const links = NAVIGATION_FILES.flatMap((file) => {
    const source = readFileSync(join(projectRoot, file), "utf8");
    return [...source.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => ({ file, href: m[1] }));
  });

  it("relit bien l'en-tête et le pied de page", () => {
    // Sans cette borne, un renommage de fichier viderait le test en silence.
    expect(links.length).toBeGreaterThan(6);
  });

  it("trouve l'arborescence des routes", () => {
    expect(known).toContain("/connexion");
    expect(known).toContain("/pro/inscription");
  });

  it("ne laisse aucun lien mort", () => {
    const dead = links
      .filter(({ href }) => !known.some((route) => matches(route, href)))
      .map(({ file, href }) => `${relative(projectRoot, file)} → ${href}`);

    expect(
      dead,
      `Lien vers une route inexistante — 404 au clic :\n${dead.join("\n")}`,
    ).toEqual([]);
  });

  it("repère un lien mort quand il y en a un", () => {
    // Garde du garde : prouve que la règle sait échouer.
    expect(known.some((route) => matches(route, "/devenir-partenaire"))).toBe(false);
  });
});

/**
 * ⚠️ **La racine d'un espace est une adresse qu'on tape, pas seulement qu'on
 * clique.**
 *
 * `/pro` a rendu un 404 en production — l'écran intégré de Next, en anglais,
 * sans la moindre marque. Et le défaut était **invisible déconnecté** : le
 * proxy renvoyait un visiteur vers `/pro/connexion`, si bien que le trou ne
 * s'ouvrait qu'une fois la session ouverte, c'est-à-dire pour les seuls
 * partenaires réels. Aucun lien du dépôt ne pointait vers `/pro` : le contrôle
 * des liens morts ci-dessus ne pouvait donc rien voir, puisqu'il part des liens
 * et non des adresses.
 *
 * Les trois autres espaces rendent leur tableau de bord à leur racine ; le
 * partenaire était le seul à ne pas avoir d'adresse courte.
 */
describe("racines des espaces", () => {
  const known = routes(appDir);

  // Ce qu'un utilisateur tape de mémoire, ou dicte au téléphone.
  const RACINES = ["/", "/compte", "/entreprise", "/pro", "/admin"];

  it("construit une page pour chaque racine d'espace", () => {
    const absentes = RACINES.filter((racine) => !known.includes(racine));

    expect(
      absentes,
      `Racine d'espace sans page : un 404 pour qui tape l'adresse.\n${absentes.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * Une adresse inconnue doit tomber sur **notre** page, pas sur celle de Next.
   * « 404 — This page could not be found » ne se lit pas « cette page n'existe
   * pas » mais « ce site est cassé » — même faute que l'écran « This page
   * couldn't load » de la coupure par inactivité.
   */
  it("rend sa propre page introuvable", () => {
    const source = readFileSync(join(projectRoot, "src/app/not-found.tsx"), "utf8");

    // La marque, et dans le bon sens : `Éni` en orange, `Event` en ardoise —
    // comme l'en-tête public et les courriels, où un test garde déjà la règle.
    expect(source).toContain('text-orange-500">Éni</span>Event');
    // Elle dit quoi faire ensuite, comme un état vide.
    expect(source).toContain('href="/recherche"');
    // ⚠️ Et jamais vers un espace privé : elle s'affiche aussi sans session.
    for (const prive of ["/pro", "/admin", "/entreprise", "/compte"]) {
      expect(source, prive).not.toContain(`href="${prive}"`);
    }
  });
});
