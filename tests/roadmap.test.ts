import { describe, expect, it } from "vitest";

import { adminNav, companyNav, partnerNav } from "@/components/dashboard/nav-config";
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
    // du titre et du lot de `/pro/annonces`.
    expect(navItemFor("partner", "/pro/annonces/nouvelle")?.label).toBe("Mes annonces");
    expect(lotFor("/pro/annonces/nouvelle")).toMatch(/Lot 3/);
  });
});

describe("attribution des lots", () => {
  it("retient le préfixe le plus spécifique", () => {
    // `/pro/finances/versements` relève de la chaîne financière, pas du
    // back-office partenaire, bien qu'il commence par `/pro`.
    expect(lotFor("/pro/finances/versements")).toMatch(/Lot 2/);
    expect(lotFor("/pro/planning")).toMatch(/Lot 3/);
  });

  it("range les devis au lot 4, quel que soit l'espace", () => {
    expect(lotFor("/pro/devis")).toMatch(/Lot 4/);
    expect(lotFor("/entreprise/devis")).toMatch(/Lot 4/);
    expect(lotFor("/admin/demandes")).toMatch(/Lot 4/);
  });

  it("place la modération au lot en cours, pas au lot 7", () => {
    // La modération fait partie de la boucle de l'offre livrée maintenant.
    expect(lotFor("/admin/moderation")).toMatch(/Lot 3/);
    expect(lotFor("/admin/feature-flags")).toMatch(/Lot 7/);
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
