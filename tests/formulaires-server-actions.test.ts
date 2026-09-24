import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Champs cachés dérivés d'un état d'affichage : le défaut qu'on ne revoit pas.
 *
 * **Ce qui s'est passé.** Le cœur des favoris envoyait son intention dans un
 * champ caché calculé au rendu :
 *
 *     <input type="hidden" name="active" value={String(!actif)} />
 *     <button onClick={() => setOptimiste(!actif)}>
 *
 * Le clic met à jour l'état, React refait le rendu, **puis** le navigateur
 * sérialise le formulaire. Le champ caché vaut alors l'inverse, et le serveur
 * reçoit le contraire de ce qu'on lui demande. En production : premier clic
 * sans effet, second clic qui allumait le cœur sans rien écrire — la réponse
 * du serveur étant identique à la précédente, la correction d'état ne se
 * déclenchait même pas. Le cœur mentait, et la page Favoris restait vide.
 *
 * **Pourquoi un contrôle sur le source.** Ni `tsc`, ni `eslint`, ni les tests
 * ne voient cette course : le code est valide, les types sont bons, et le
 * défaut ne se manifeste qu'à l'exécution dans un navigateur — que ce dépôt
 * n'a pas les moyens de piloter. Un contrôle sur le texte du composant est
 * grossier, mais c'est le seul qui morde.
 *
 * **La règle.** Un champ caché porte une donnée **stable** — un identifiant,
 * un contexte. Jamais une valeur dérivée d'un `useState` que le même geste
 * modifie. Quand l'état d'arrivée dépend de l'état de départ, c'est au serveur
 * de le lire : une bascule se décide en base, où la vérité se trouve déjà.
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

/**
 * Les états qu'un bouton de soumission modifie **dans son propre `onClick`**.
 *
 * C'est le seul cas dangereux, et il faut le distinguer avec soin. Un champ
 * caché qui porte une **sélection** — les dates choisies dans un calendrier,
 * une case cochée — est parfaitement légitime : l'utilisateur l'a constituée
 * plus tôt, par un autre geste, et la soumettre est tout l'objet du champ.
 * `BookingBox`, `BriefForm` et `PlanningBoard` en font un usage correct.
 *
 * Le défaut, lui, est une **course** : le clic qui envoie le formulaire change
 * en même temps la valeur que ce formulaire transporte.
 */
function statesMutatedOnSubmit(source: string): string[] {
  const setters = new Map(
    [...source.matchAll(/const\s*\[\s*([A-Za-z0-9_]+)\s*,\s*(set[A-Za-z0-9_]+)\s*\]/g)].map(
      (m) => [m[2], m[1]] as const,
    ),
  );

  const mutes: string[] = [];

  for (const bouton of source.matchAll(/<button\b/g)) {
    const balise = openingTag(source, bouton.index);
    if (!/type="submit"/.test(balise)) continue;

    for (const appel of balise.matchAll(/\b(set[A-Za-z0-9_]+)\s*\(/g)) {
      const etat = setters.get(appel[1]);
      if (etat) mutes.push(etat);
    }
  }

  return mutes;
}

/**
 * La balise ouvrante complète, accolades suivies.
 *
 * ⚠️ **Une expression régulière `<button[^>]*>` ne suffit pas**, et c'est une
 * erreur que ce test a lui-même commise : `onClick={() => setX(v)}` contient
 * un `>` dans la flèche. La capture s'arrêtait donc avant l'appel au setter,
 * et le contrôle laissait passer exactement le défaut qu'il devait attraper.
 * Vérifié en réintroduisant le code fautif : le test restait vert.
 *
 * On suit donc la profondeur des accolades, et on ne s'arrête qu'au chevron
 * qui ferme réellement la balise.
 */
function openingTag(source: string, start: number): string {
  let depth = 0;

  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return source.slice(start, i + 1);
  }

  return source.slice(start);
}

/** Les expressions `value={…}` des champs cachés d'un fichier. */
function hiddenValues(source: string): string[] {
  return [...source.matchAll(/type="hidden"[^>]*?value=\{([^}]*)\}/g)].map((m) => m[1]);
}

describe("champs cachés des formulaires", () => {
  it("ne dérive pas un champ caché d'un état que le clic de soumission modifie", () => {
    const fautifs: string[] = [];

    for (const file of tsxFiles(componentsDir)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('type="hidden"')) continue;

      const dangereux = statesMutatedOnSubmit(source);
      if (dangereux.length === 0) continue;

      for (const valeur of hiddenValues(source)) {
        const coupable = dangereux.find((nom) => new RegExp(`\\b${nom}\\b`).test(valeur));

        if (coupable) {
          fautifs.push(
            `${relative(projectRoot, file)} : value={${valeur.trim()}} dépend de « ${coupable} », ` +
              `que le clic de soumission modifie`,
          );
        }
      }
    }

    expect(fautifs).toEqual([]);
  });

  it("garde le cœur des favoris sans aucun état dans sa charge utile", () => {
    // Le cas qui a produit la règle. Nommé explicitement : une régression ici
    // doit désigner le bon fichier du premier coup.
    const source = readFileSync(
      fileURLToPath(new URL("../src/components/marketplace/FavoriteButton.tsx", import.meta.url)),
      "utf8",
    );

    const caches = [...source.matchAll(/type="hidden"\s+name="([^"]+)"/g)].map((m) => m[1]);

    // L'identifiant de l'annonce, et rien d'autre. Surtout pas `active`.
    expect(caches).toEqual(["listingId"]);
    expect(source).not.toContain('name="active"');
  });
});
