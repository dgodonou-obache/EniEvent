import { describe, expect, it } from "vitest";

import { bearerMatches } from "@/lib/auth/bearer";
import { safeInternalPath } from "@/lib/validation/redirect";

/**
 * Redirections ouvertes et jetons porteurs — audit du 8 octobre 2026.
 *
 * ⚠️ Ces tests existent parce que le filtre précédent **paraissait correct**.
 * `startsWith("/") && !startsWith("//")` bloque la forme à laquelle on pense,
 * et laisse passer celle à laquelle on ne pense pas. Les cas ci-dessous sont
 * ceux qui ont été mesurés, pas imaginés.
 */

const REPLI = "/compte";

describe("destinations refusées", () => {
  /**
   * Le contournement réellement trouvé. Le parseur d'URL traite `\` comme `/`
   * pour les schémas http et https : `/\evil.com` devient `//evil.com`, donc
   * un changement d'hôte, alors que la chaîne commence bien par une barre
   * unique.
   */
  it("refuse l'anti-slash, qui franchissait l'ancien filtre", () => {
    for (const forge of ["/\\evil.com", "/\\/evil.com", "/\\\\evil.com", "/\\evil.com/connexion"]) {
      expect(safeInternalPath(forge, REPLI), forge).toBe(REPLI);
    }
  });

  it("refuse la double barre", () => {
    for (const forge of ["//evil.com", "///evil.com", "//evil.com/compte"]) {
      expect(safeInternalPath(forge, REPLI), forge).toBe(REPLI);
    }
  });

  it("refuse une URL absolue, quel que soit le schéma", () => {
    for (const forge of [
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
    ]) {
      expect(safeInternalPath(forge, REPLI), forge).toBe(REPLI);
    }
  });

  it("refuse les caractères de contrôle, qu'un parseur pourrait ignorer", () => {
    // Un parseur indulgent retire ces caractères *avant* d'analyser : la chaîne
    // qu'on a inspectée n'est alors pas celle qui sera suivie.
    for (const forge of ["/\tevil.com", "/\nevil.com", "/\revil.com", "/\u0000evil.com"]) {
      expect(safeInternalPath(forge, REPLI), JSON.stringify(forge)).toBe(REPLI);
    }
  });

  it("refuse ce qui n'est pas une chaîne, ou ne commence pas par une barre", () => {
    for (const forge of [null, undefined, 42, {}, [], "", "compte", "evil.com", " /compte"]) {
      expect(safeInternalPath(forge, REPLI)).toBe(REPLI);
    }
  });
});

describe("destinations acceptées", () => {
  it("laisse passer un chemin interne et ses paramètres", () => {
    expect(safeInternalPath("/compte/reservations", REPLI)).toBe("/compte/reservations");
    expect(safeInternalPath("/recherche?ville=cotonou&page=2", REPLI)).toBe(
      "/recherche?ville=cotonou&page=2",
    );
    expect(safeInternalPath("/pro/connexion?raison=inactivite", REPLI)).toBe(
      "/pro/connexion?raison=inactivite",
    );
  });

  it("rend une forme canonique, traversées résolues", () => {
    // Ce qui sort vient du parseur, pas de l'entrée : `..` est déjà appliqué.
    expect(safeInternalPath("/compte/../projets", REPLI)).toBe("/projets");
    expect(safeInternalPath("/compte/./profil", REPLI)).toBe("/compte/profil");
  });

  it("conserve un accent encodé", () => {
    expect(safeInternalPath("/recherche?q=caf%C3%A9", REPLI)).toBe("/recherche?q=caf%C3%A9");
  });

  /**
   * ⚠️ Le garde-fou qui compte : un chemin accepté ne doit jamais, une fois
   * recomposé sur l'origine réelle, pointer ailleurs. C'est la propriété que
   * l'ancien filtre violait.
   */
  it("ne sort jamais du site, quelle que soit l'entrée", () => {
    const origine = "https://enievent.com";
    const entrees = [
      "/compte",
      "/\\evil.com",
      "//evil.com",
      "https://evil.com",
      "/\tevil.com",
      "/compte/../../evil.com",
      "/%2F%2Fevil.com",
      "/\\\\evil.com\\compte",
    ];

    for (const entree of entrees) {
      const sortie = safeInternalPath(entree, REPLI);
      expect(new URL(sortie, origine).origin, `${entree} → ${sortie}`).toBe(origine);
    }
  });
});

describe("jeton porteur des tâches planifiées", () => {
  const SECRET = "un-secret-de-tache-planifiee-suffisamment-long";

  it("accepte le jeton exact", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuse tout le reste", () => {
    for (const faux of [
      null,
      "",
      "Bearer ",
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      SECRET,
      `bearer ${SECRET}`,
      `Bearer ${SECRET} `,
      `Basic ${SECRET}`,
    ]) {
      expect(bearerMatches(faux, SECRET), JSON.stringify(faux)).toBe(false);
    }
  });

  it("ne trahit pas la longueur du secret par une exception", () => {
    // `timingSafeEqual` lève sur deux tampons de tailles différentes : sans le
    // rembourrage, un en-tête trop court aurait produit un 500 au lieu d'un 401.
    expect(() => bearerMatches("B", SECRET)).not.toThrow();
    expect(() => bearerMatches("B".repeat(5000), SECRET)).not.toThrow();
  });
});
