import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  filtrerLignes,
  numerosAutour,
  trierLignes,
  type Ligne,
} from "@/components/dashboard/DataTable";
import { format, money } from "@/lib/money";

/**
 * Le tableau des espaces professionnels.
 *
 * Trois défauts y sont invisibles à l'œil comme au typecheck, et ce sont les
 * trois que ces tests gardent :
 *
 * - **un tri sur le texte affiché** range 900 000 après 1 100 000 et décembre
 *   avant janvier. Aucune erreur, aucun écran cassé — juste un ordre faux sur
 *   une colonne de chiffres qu'on croit rangée ;
 * - **une pagination qui saute un numéro** rend des lignes inatteignables sans
 *   rien dire ;
 * - **un menu déroulant dans un conteneur à défilement** est rogné : CSS impose
 *   qu'un axe en `auto` force l'autre à `auto`, donc `overflow-x-auto` coupe
 *   aussi en hauteur, quel que soit le `z-index`. Même famille que
 *   `backdrop-blur` et les contextes d'empilement (`tests/stacking.test.ts`).
 */

const ligne = (id: string, valeurs: Record<string, string>, tris?: Record<string, string | number>): Ligne => ({
  id,
  href: `/pro/devis/${id}`,
  valeurs,
  tris,
});

describe("on trie sur la donnée, jamais sur ce qu'on affiche", () => {
  it("range les montants par leur valeur, et non par leur texte", () => {
    // Le cas qui compte. En comparaison de chaînes, « 1 100 000 FCFA » passe
    // avant « 900 000 FCFA » — l'écran paraît rangé, et il ne l'est pas.
    const lignes = [
      ligne("a", { montant: "900 000 FCFA" }, { montant: 900_000 }),
      ligne("b", { montant: "1 100 000 FCFA" }, { montant: 1_100_000 }),
      ligne("c", { montant: "75 000 FCFA" }, { montant: 75_000 }),
    ];

    const croissant = trierLignes(lignes, { cle: "montant", sens: "asc" });
    expect(croissant.map((l) => l.id)).toEqual(["c", "a", "b"]);

    const decroissant = trierLignes(lignes, { cle: "montant", sens: "desc" });
    expect(decroissant.map((l) => l.id)).toEqual(["b", "a", "c"]);
  });

  it("range les dates par leur forme ISO, et non par leur libellé français", () => {
    // Les libellés sont choisis pour que les deux ordres **divergent** : sur le
    // texte, « 2 janv. 2027 » passe avant « 10 déc. 2026 » — le 2 avant le 10,
    // et le mois n'est jamais lu. Un jeu de dates mal choisi ferait passer ce
    // test par coïncidence, et il ne garderait plus rien.
    const lignes = [
      ligne("dec", { evenement: "10 déc. 2026" }, { evenement: "2026-12-10" }),
      ligne("jan", { evenement: "2 janv. 2027" }, { evenement: "2027-01-02" }),
      ligne("avr", { evenement: "1 avr. 2026" }, { evenement: "2026-04-01" }),
    ];

    expect(trierLignes(lignes, { cle: "evenement", sens: "asc" }).map((l) => l.id)).toEqual([
      "avr",
      "dec",
      "jan",
    ]);
  });

  it("retombe sur la valeur affichée quand aucune donnée brute n'est fournie", () => {
    const lignes = [ligne("b", { reference: "DEV-2" }), ligne("a", { reference: "DEV-1" })];

    expect(trierLignes(lignes, { cle: "reference", sens: "asc" }).map((l) => l.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("classe les accents comme un lecteur francophone", () => {
    // Sans `localeCompare`, « Élodie » part après « Zoé » : l'ordre des points
    // de code met tous les accents à la fin. Un catalogue béninois en est plein.
    const lignes = [
      ligne("z", { demande: "Zoé" }),
      ligne("e", { demande: "Élodie" }),
      ligne("a", { demande: "Adjara" }),
    ];

    expect(trierLignes(lignes, { cle: "demande", sens: "asc" }).map((l) => l.id)).toEqual([
      "a",
      "e",
      "z",
    ]);
  });

  it("ne touche pas à l'ordre d'origine sans consigne de tri", () => {
    // L'ordre par défaut est celui que la base a choisi — le plus récent
    // d'abord. Le tableau ne doit pas le redécider tout seul.
    const lignes = [ligne("c", { x: "3" }), ligne("a", { x: "1" }), ligne("b", { x: "2" })];

    expect(trierLignes(lignes, null).map((l) => l.id)).toEqual(["c", "a", "b"]);
  });

  it("ne modifie jamais le tableau reçu", () => {
    const lignes = [ligne("b", { x: "2" }), ligne("a", { x: "1" })];
    trierLignes(lignes, { cle: "x", sens: "asc" });

    expect(lignes.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

/**
 * La recherche libre.
 *
 * Elle porte sur **ce qu'on affiche et sur la donnée brute** : une date se lit
 * « 4 janv. 2027 » et se range `2027-01-04`, et les deux sont des recherches
 * légitimes. Personne ne devrait avoir à deviner laquelle le tableau connaît.
 */
describe("recherche", () => {
  /**
   * ⚠️ Les montants passent par le **vrai formateur**, et non par une chaîne
   * tapée à la main. Première version de ces cas : la valeur affichée était
   * écrite « 1 100 000 » avec des espaces ordinaires, si bien que le cas de
   * l'espace fine insécable se cherchait lui-même et passait au vert avec la
   * normalisation retirée. Un test qui ne reçoit pas la donnée réelle ne garde
   * rien.
   */
  const somme = (n: number) => format(money(n, "XOF"), { withCurrency: false });

  const lignes = [
    {
      ...ligne(
        "a",
        { reference: "CMD-202610-000156", evenement: "4 janv. 2027", montant: somme(1_100_000) },
        { evenement: "2027-01-04", montant: 1_100_000 },
      ),
      details: { reference: "Auditorium Cadjèhoun" },
    },
    {
      ...ligne(
        "b",
        { reference: "CMD-202609-000097", evenement: "23 sept. 2026", montant: somme(250_000) },
        { evenement: "2026-09-23", montant: 250_000 },
      ),
      details: { reference: "Jardin de Fidjrossè" },
    },
  ];

  it("trouve par référence, même partielle", () => {
    expect(filtrerLignes(lignes, "000156").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, "CMD-2026").map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("trouve une date sous ses deux formes", () => {
    // Le cœur de la demande : chercher « 2027-01 » comme « janv » doit marcher.
    expect(filtrerLignes(lignes, "janv").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, "2027-01").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, "2026-09-23").map((l) => l.id)).toEqual(["b"]);
  });

  it("ignore les accents, que personne ne tape dans un champ de recherche", () => {
    expect(filtrerLignes(lignes, "cadjehoun").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, "fidjrosse").map((l) => l.id)).toEqual(["b"]);
  });

  /**
   * ⚠️ **L'espace fine insécable.**
   *
   * `Intl.NumberFormat` sépare les milliers par U+202F, et non par l'espace du
   * clavier. Les deux gestes naturels — **taper** le montant, et le **recopier
   * depuis l'écran** — n'envoient donc pas du tout la même chaîne, et doivent
   * pourtant donner le même résultat.
   */
  it("trouve un montant, qu'on le tape ou qu'on le recopie de l'écran", () => {
    // Le contrôle ne vaut que si la mise en forme emploie bien une espace
    // exotique : sinon il passerait au vert sans rien prouver.
    expect(somme(1_100_000)).not.toContain(" ");
    expect(somme(1_100_000)).toMatch(/\s/);

    expect(filtrerLignes(lignes, "1 100 000").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, somme(1_100_000)).map((l) => l.id)).toEqual(["a"]);
  });

  it("trouve aussi un montant tapé sans séparateur", () => {
    // « 1100000 » ne ressemble à rien de ce qui est affiché : c'est la donnée
    // brute qui répond.
    expect(filtrerLignes(lignes, "1100000").map((l) => l.id)).toEqual(["a"]);
  });

  it("restreint quand on ajoute un mot, au lieu d'élargir", () => {
    expect(filtrerLignes(lignes, "cmd 2027").map((l) => l.id)).toEqual(["a"]);
    expect(filtrerLignes(lignes, "cmd jardin").map((l) => l.id)).toEqual(["b"]);
  });

  it("rend tout sur une recherche vide, sans toucher à l'ordre", () => {
    expect(filtrerLignes(lignes, "").map((l) => l.id)).toEqual(["a", "b"]);
    expect(filtrerLignes(lignes, "   ").map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("rend une liste vide plutôt que tout, quand rien ne correspond", () => {
    // Une recherche infructueuse qui rendrait tout ferait croire à un filtre
    // cassé — ou pire, ferait agir sur la mauvaise ligne.
    expect(filtrerLignes(lignes, "porto-novo")).toEqual([]);
  });
});

describe("pagination", () => {
  it("montre tout tant que ça tient", () => {
    expect(numerosAutour(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("garde toujours la première et la dernière page atteignables", () => {
    for (const courante of [1, 2, 5, 9, 10]) {
      const numeros = numerosAutour(courante, 10);

      expect(numeros, `page ${courante}`).toContain(1);
      expect(numeros, `page ${courante}`).toContain(10);
      expect(numeros, `page ${courante}`).toContain(courante);
    }
  });

  it("ne laisse jamais un trou qui cache une seule page", () => {
    // Le contrôle qui compte : une coupure posée entre deux numéros
    // consécutifs rendrait une page inatteignable sans que rien ne le dise.
    for (let pages = 1; pages <= 40; pages += 1) {
      for (let courante = 1; courante <= pages; courante += 1) {
        const numeros = numerosAutour(courante, pages);

        numeros.forEach((numero, index) => {
          if (numero !== null) return;

          const avant = numeros[index - 1];
          const apres = numeros[index + 1];
          expect(
            typeof avant === "number" && typeof apres === "number" && apres - avant > 1,
            `coupure inutile en ${courante}/${pages}`,
          ).toBe(true);
        });
      }
    }
  });

  it("reste ordonné et sans doublon", () => {
    for (let courante = 1; courante <= 25; courante += 1) {
      const numeros = numerosAutour(courante, 25).filter((n): n is number => n !== null);

      expect(new Set(numeros).size, `page ${courante}`).toBe(numeros.length);
      expect([...numeros].sort((a, b) => a - b), `page ${courante}`).toEqual(numeros);
    }
  });
});

/**
 * ⚠️ **Le piège qui ne se voit qu'une fois le menu ouvert.**
 *
 * Un tableau défile horizontalement dans son conteneur. CSS impose qu'un axe en
 * `auto` force l'autre à `auto` : `overflow-x-auto` **rogne donc aussi en
 * hauteur**. Un menu posé en absolu dedans est coupé net, quel que soit son
 * `z-index` — et personne ne le voit au typecheck, au lint ni au build.
 */
describe("menus déroulants dans un conteneur à défilement", () => {
  const racine = fileURLToPath(new URL("../src/components/", import.meta.url));
  const projet = fileURLToPath(new URL("../", import.meta.url));

  function tsx(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dir, entree.name);
      if (entree.isDirectory()) return tsx(chemin);
      return entree.name.endsWith(".tsx") ? [chemin] : [];
    });
  }

  const concernes = tsx(racine).filter((chemin) => {
    const source = readFileSync(chemin, "utf8");
    return source.includes("overflow-x-auto") && source.includes('role="menu"');
  });

  it("trouve au moins un tableau à menu", () => {
    // À zéro, le contrôle suivant ne vérifierait plus rien.
    expect(concernes.length).toBeGreaterThan(0);
  });

  it("ouvre ces menus en position fixe, jamais en absolu", () => {
    const coupables: string[] = [];

    for (const chemin of concernes) {
      const source = readFileSync(chemin, "utf8");

      // Le bloc du menu : de `role="menu"` à la fin de sa liste de classes.
      const bloc = /role="menu"[\s\S]{0,400}?className=\{?["'`]([^"'`]+)["'`]/.exec(source);

      if (!bloc) {
        coupables.push(`${relative(projet, chemin)} → classes du menu introuvables`);
        continue;
      }

      const classes = bloc[1];
      if (/(^|\s)fixed(\s|$)/.test(classes)) continue;

      coupables.push(`${relative(projet, chemin)} → « ${classes} »`);
    }

    expect(
      coupables,
      "Menu rogné par le conteneur à défilement du tableau : il lui faut `fixed`, " +
        `pas \`absolute\`.\n${coupables.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * ⚠️ **Pas de case à cocher dans ces tableaux.** Le modèle dont ils s'inspirent
 * en portait une par ligne ; aucune action de masse n'existe dans ces écrans,
 * et une colonne de cases qui ne commande rien est le même défaut qu'un
 * interrupteur débranché — on la coche, on croit avoir sélectionné, rien ne
 * suit.
 */
describe("aucune sélection qui ne commande rien", () => {
  it("ne pose pas de case à cocher dans le tableau", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/components/dashboard/DataTable.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain('type="checkbox"');
  });
});
