import { describe, expect, it } from "vitest";

import { accountNav, adminNav, companyNav, partnerNav } from "@/components/dashboard/nav-config";
import { lotFor, navItemFor } from "@/components/dashboard/roadmap";

/**
 * Les écrans d'attente remplacent 50 liens de menu qui renvoyaient un 404.
 * Ces tests garantissent qu'aucune entrée de menu ne tombe sur un écran sans
 * titre ni lot — ce serait à peine mieux qu'une erreur.
 */

const ALL = [
  ...partnerNav.sections.flatMap((s) => s.items.map((i) => ({ space: "partner" as const, ...i }))),
  ...companyNav.sections.flatMap((s) => s.items.map((i) => ({ space: "company" as const, ...i }))),
  ...adminNav.sections.flatMap((s) => s.items.map((i) => ({ space: "admin" as const, ...i }))),
  // L'espace particulier tenait sa propre liste, hors de portée de ces
  // contrôles : six de ses huit onglets renvoyaient un 404 en production.
  ...accountNav.sections.flatMap((s) => s.items.map((i) => ({ space: "account" as const, ...i }))),
];

describe("couverture des menus", () => {
  it("attribue un lot à chaque entrée de menu", () => {
    const orphans = ALL.filter((item) => lotFor(item.href) === "À planifier");
    expect(orphans.map((o) => o.href)).toEqual([]);
  });

  it("retrouve le libellé de chaque entrée de menu", () => {
    const untitled = ALL.filter((item) => navItemFor(item.space, item.href) === undefined);
    expect(untitled.map((u) => u.href)).toEqual([]);
  });

  it("couvre aussi les sous-routes non listées au menu", () => {
    // `/pro/annonces/nouvelle` n'est pas une entrée de menu mais doit hériter
    // du titre de `/pro/annonces`, et d'un lot par la route attrape-tout.
    expect(navItemFor("partner", "/pro/annonces/nouvelle")?.label).toBe("Mes annonces");
    expect(lotFor("/pro/annonces/nouvelle")).not.toBe("À planifier");
  });
});

describe("attribution des lots", () => {
  it("retient le préfixe le plus spécifique", () => {
    // `/pro/finances/factures` relève de la facturation, pas du repli de
    // l'espace partenaire, bien qu'il commence par `/pro`.
    expect(lotFor("/pro/finances/factures")).toMatch(/Lot B/);
    expect(lotFor("/pro/statistiques")).toMatch(/Lot D/);
  });

  it("range la facturation au même lot, quel que soit l'espace", () => {
    expect(lotFor("/pro/finances/factures")).toMatch(/Lot B/);
    expect(lotFor("/entreprise/factures")).toMatch(/Lot B/);
    expect(lotFor("/admin/reservations")).toMatch(/Lot B/);
  });

  it("range les avis et les litiges au lot de la confiance", () => {
    expect(lotFor("/pro/avis")).toMatch(/Lot A/);
    expect(lotFor("/admin/avis")).toMatch(/Lot A/);
    expect(lotFor("/admin/litiges")).toMatch(/Lot A/);
  });

  /**
   * ⚠️ Le garde-fou qui compte vraiment.
   *
   * Un écran d'attente annonçant un lot **déjà livré** ne dit pas « pas
   * encore » : il dit « ce produit est à l'arrêt ». C'est arrivé — les lots 2
   * à 5 étaient en production pendant que les menus les annonçaient à venir.
   * Les lots restants sont donc lettrés, et cette liste interdit le retour de
   * l'ancienne numérotation dans la table.
   */
  it("ne nomme aucun lot de l'ancienne numérotation", () => {
    const tous = ALL.map((item) => lotFor(item.href));
    const anciens = tous.filter((lot) => /Lot \d/.test(lot));

    expect(anciens).toEqual([]);
  });
});

describe("titres des entrées", () => {
  it("préfère l'entrée la plus longue en cas de préfixe commun", () => {
    expect(navItemFor("partner", "/pro/finances/versements")?.label).toBe("Versements");
  });

  it("ne confond pas deux espaces", () => {
    // `/pro/avis` et `/admin/avis` existent tous les deux.
    expect(navItemFor("partner", "/pro/avis")?.href).toBe("/pro/avis");
    expect(navItemFor("admin", "/admin/avis")?.href).toBe("/admin/avis");
    expect(navItemFor("company", "/pro/avis")).toBeUndefined();
  });
});
