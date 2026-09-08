import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  buildSearchUrl,
  clearFilters,
  pageRange,
  parseFilters,
  toSearchParams,
  toggleAmenity,
  withFilter,
  PAGE_SIZE,
} from "@/lib/search";

/**
 * L'URL est la source de vérité de la recherche : elle doit survivre au
 * partage, au favori et au rechargement. Ces tests portent surtout sur ce qui
 * arrive quand l'URL est trafiquée — elle vient de l'extérieur.
 */

const params = (query: string) => new URLSearchParams(query);

describe("lecture des filtres", () => {
  it("lit une recherche complète", () => {
    const filters = parseFilters(
      params(
        "q=salle&ville=Cotonou&categorie=traiteur&type=venue&du=2026-12-24&au=2026-12-26&invites=200&budget=500000&equipements=wifi&equipements=parking&reservation=instant&tri=prix-croissant&page=3",
      ),
    );

    expect(filters).toEqual({
      q: "salle",
      city: "Cotonou",
      category: "traiteur",
      kind: "venue",
      from: "2026-12-24",
      to: "2026-12-26",
      guests: 200,
      budgetMax: 500000,
      amenities: ["wifi", "parking"],
      bookingMode: "instant",
      sort: "prix-croissant",
      page: 3,
    });
  });

  it("applique des défauts sains sur une URL vide", () => {
    const filters = parseFilters(params(""));
    expect(filters.sort).toBe("pertinence");
    expect(filters.page).toBe(1);
    expect(filters.amenities).toEqual([]);
  });

  it("accepte les équipements répétés ou séparés par des virgules", () => {
    expect(parseFilters(params("equipements=wifi,parking,scene")).amenities).toEqual([
      "wifi",
      "parking",
      "scene",
    ]);
  });

  it("dédoublonne les équipements", () => {
    expect(parseFilters(params("equipements=wifi&equipements=wifi")).amenities).toEqual(["wifi"]);
  });

  it("lit aussi un objet de searchParams Next", () => {
    const filters = parseFilters({ ville: "Porto-Novo", equipements: ["wifi", "parking"] });
    expect(filters.city).toBe("Porto-Novo");
    expect(filters.amenities).toEqual(["wifi", "parking"]);
  });
});

describe("assainissement", () => {
  it("ignore un tri inconnu", () => {
    expect(parseFilters(params("tri=le-moins-cher-du-monde")).sort).toBe("pertinence");
  });

  it("ignore un type et un mode de réservation inconnus", () => {
    const filters = parseFilters(params("type=chateau&reservation=troc"));
    expect(filters.kind).toBeUndefined();
    expect(filters.bookingMode).toBeUndefined();
  });

  it("ignore une date mal formée", () => {
    expect(parseFilters(params("du=hier")).from).toBeUndefined();
    expect(parseFilters(params("du=24-12-2026")).from).toBeUndefined();
  });

  it("ignore une date inexistante malgré la bonne forme", () => {
    // 2026-02-30 a le bon format sans exister.
    expect(parseFilters(params("du=2026-02-30")).from).toBeUndefined();
    expect(parseFilters(params("du=2026-13-01")).from).toBeUndefined();
  });

  it("ignore une fin antérieure au début plutôt que de ne rien renvoyer", () => {
    const filters = parseFilters(params("du=2026-12-26&au=2026-12-24"));
    expect(filters.from).toBe("2026-12-26");
    expect(filters.to).toBeUndefined();
  });

  it("ignore les nombres négatifs, nuls ou absurdes", () => {
    expect(parseFilters(params("invites=-10")).guests).toBeUndefined();
    expect(parseFilters(params("invites=0")).guests).toBeUndefined();
    expect(parseFilters(params("budget=beaucoup")).budgetMax).toBeUndefined();
    expect(parseFilters(params("page=0")).page).toBe(1);
    expect(parseFilters(params("page=-5")).page).toBe(1);
  });

  it("borne la longueur des champs texte", () => {
    const long = "a".repeat(500);
    expect(parseFilters(params(`q=${long}`)).q?.length).toBe(120);
    expect(parseFilters(params(`ville=${long}`)).city?.length).toBe(80);
  });
});

describe("écriture de l'URL", () => {
  it("n'écrit pas les valeurs par défaut", () => {
    // Une recherche vierge doit rester une URL propre.
    expect(buildSearchUrl(clearFilters())).toBe("/recherche");
    expect(toSearchParams({ sort: "pertinence", page: 1 }).toString()).toBe("");
  });

  it("écrit les filtres actifs", () => {
    const url = buildSearchUrl({
      city: "Cotonou",
      category: "traiteur",
      amenities: ["wifi", "parking"],
      sort: "prix-croissant",
      page: 2,
    });

    expect(url).toContain("ville=Cotonou");
    expect(url).toContain("categorie=traiteur");
    expect(url).toContain("equipements=wifi");
    expect(url).toContain("equipements=parking");
    expect(url).toContain("tri=prix-croissant");
    expect(url).toContain("page=2");
  });

  it("fait l'aller-retour sans perte", () => {
    const original = parseFilters(
      params("ville=Ouidah&categorie=villa&invites=80&equipements=piscine&tri=note&page=2"),
    );
    expect(parseFilters(toSearchParams(original))).toEqual(original);
  });

  it("accepte un autre chemin de destination", () => {
    expect(buildSearchUrl({ city: "Cotonou" }, "/lieux")).toBe("/lieux?ville=Cotonou");
  });
});

describe("manipulation des filtres", () => {
  it("revient à la première page à chaque changement", () => {
    // Rester en page 4 après avoir changé de ville afficherait une page vide.
    const filters = { ...clearFilters(), page: 4 };
    expect(withFilter(filters, "city", "Parakou").page).toBe(1);
  });

  it("bascule un équipement dans les deux sens", () => {
    let filters = clearFilters();
    filters = toggleAmenity(filters, "wifi");
    expect(filters.amenities).toEqual(["wifi"]);

    filters = toggleAmenity(filters, "wifi");
    expect(filters.amenities).toEqual([]);
  });

  it("compte les filtres actifs pour le badge de l'interface", () => {
    expect(activeFilterCount(clearFilters())).toBe(0);

    const filters = parseFilters(
      params("ville=Cotonou&categorie=traiteur&equipements=wifi&equipements=parking&tri=note"),
    );
    // ville + catégorie + 2 équipements ; le tri n'est pas un filtre.
    expect(activeFilterCount(filters)).toBe(4);
  });
});

describe("pagination", () => {
  it("calcule la fenêtre de la première page", () => {
    expect(pageRange(1)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
  });

  it("calcule la fenêtre d'une page suivante", () => {
    expect(pageRange(3)).toEqual({ from: PAGE_SIZE * 2, to: PAGE_SIZE * 3 - 1 });
  });
});
