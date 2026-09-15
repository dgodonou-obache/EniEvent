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
