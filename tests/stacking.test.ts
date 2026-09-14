import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contextes d'empilement et menus déroulants.
 *
 * `backdrop-filter` — posé par `backdrop-blur` — **crée un contexte
 * d'empilement**. Un menu déroulant placé à l'intérieur ne peut alors plus
 * passer au-dessus de quoi que ce soit hors de ce conteneur, quel que soit son
 * `z-index` : le sien est enfermé.
 *
 * C'est exactement ce qui est arrivé au calendrier de la barre de recherche
 * d'accueil : le titre du bandeau, qui porte `drop-shadow-sm` (donc un
 * `filter`, donc un contexte lui aussi) et vient après dans le DOM, se peignait
 * par-dessus le calendrier ouvert.
 *
 * Le défaut ne se voit ni au typecheck, ni au lint, ni au build — seulement à
 * l'œil, et seulement quand le menu est ouvert. D'où ce contrôle sur le source.
 */

const componentsDir = fileURLToPath(new URL("../src/components/", import.meta.url));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** Utilitaires Tailwind qui posent un z-index : `z-10`, `z-[60]`… */
const HAS_Z_INDEX = /(^|\s)z-(\[?-?\d)/;

describe("menus déroulants et contextes d'empilement", () => {
  const withDropdown = tsxFiles(componentsDir).filter((path) =>
    readFileSync(path, "utf8").includes("CustomDatePicker"),
  );

  it("trouve les composants qui ouvrent un calendrier", () => {
    // Si ce test tombe à zéro, les suivants ne vérifieraient plus rien.
    expect(withDropdown.length).toBeGreaterThan(1);
  });

  it("impose un z-index à tout conteneur flouté abritant un calendrier", () => {
    const offenders: string[] = [];

    for (const path of withDropdown) {
      const source = readFileSync(path, "utf8");

      // Chaque littéral de classes de ce fichier, quel que soit le guillemet.
      for (const match of source.matchAll(/(?:className|class)=\{?["'`]([^"'`]+)["'`]/g)) {
        const classes = match[1];
        if (!classes.includes("backdrop-blur")) continue;
        if (HAS_Z_INDEX.test(classes)) continue;

        offenders.push(`${relative(projectRoot, path)} → « ${classes} »`);
      }
    }

    expect(
      offenders,
      `Conteneur flouté sans z-index : le calendrier qu'il contient ne pourra pas ` +
        `passer au-dessus du reste de la page.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
