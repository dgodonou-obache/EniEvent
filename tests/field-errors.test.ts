import { describe, expect, it } from "vitest";

import { invalidFieldNames } from "@/components/ui/use-field-errors";

/**
 * Où emmener l'utilisateur quand un formulaire refuse.
 *
 * **Le piège tient en une phrase :** l'objet d'erreurs vient de Zod ou d'une
 * Server Action, et **l'ordre de ses clés suit la déclaration du schéma, pas la
 * mise en page**. Sur la création d'une annonce — quinze champs — suivre cet
 * ordre-là ferait descendre l'utilisateur au tarif alors qu'une erreur l'attend
 * sur le titre, tout en haut. Il corrigerait le mauvais champ, revaliderait, et
 * se retrouverait renvoyé ailleurs.
 *
 * Rien dans le typage ne distingue les deux ordres : seul un test le peut.
 */

/** L'ordre réel des champs à l'écran, sur le formulaire de création d'annonce. */
const ECRAN = ["title", "categoryId", "city", "district", "description", "minPrice"];

describe("choix des champs à signaler", () => {
  it("suit l'ordre de l'écran, pas celui de l'objet d'erreurs", () => {
    // Zod rend ici le tarif en premier et le titre en dernier : c'est
    // exactement le cas qui trompe.
    const errors = { minPrice: "Tarif trop bas", title: "Titre trop court" };

    expect(invalidFieldNames(errors, ECRAN)).toEqual(["title", "minPrice"]);
  });

  it("signale tous les champs fautifs, pas seulement le premier", () => {
    // Le rouge doit apparaître partout où il y a à corriger : n'en marquer
    // qu'un ferait recommencer la validation autant de fois qu'il y a de
    // fautes.
    const errors = { description: "Trop courte", title: "Requis", city: "Requise" };

    expect(invalidFieldNames(errors, ECRAN)).toEqual(["title", "city", "description"]);
  });

  it("ignore une erreur qui ne correspond à aucun champ", () => {
    // Message global, groupe de cases sans `name`, clé obsolète : mieux vaut ne
    // déplacer personne que de déplacer au hasard.
    const errors = { form: "Une erreur est survenue", inconnu: "?" };

    expect(invalidFieldNames(errors, ECRAN)).toEqual([]);
  });

  it("ne retient qu'une fois un nom répété", () => {
    // Un groupe de cases à cocher partage un même `name` : le focus doit aller
    // à la première, pas être disputé entre toutes.
    const cases = ["categoryIds", "categoryIds", "categoryIds", "city"];

    expect(invalidFieldNames({ categoryIds: "Choisissez-en une" }, cases)).toEqual([
      "categoryIds",
    ]);
  });

  it("ne signale rien quand il n'y a rien à corriger", () => {
    for (const vide of [undefined, null, {}, { title: undefined }, { title: "" }]) {
      expect(invalidFieldNames(vide, ECRAN), JSON.stringify(vide)).toEqual([]);
    }
  });

  it("traverse un formulaire sans aucun champ nommé sans se plaindre", () => {
    expect(invalidFieldNames({ title: "Requis" }, [])).toEqual([]);
    expect(invalidFieldNames({ title: "Requis" }, ["", "", ""])).toEqual([]);
  });
});
