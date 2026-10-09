import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatRating } from "@/components/reviews/RatingStars";
import {
  RATING_RANK_MIN,
  REASON_MIN,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  reviewReplySchema,
  reviewSchema,
} from "@/lib/validation/review";

const UUID = "11111111-1111-4111-8111-111111111111";
const racine = join(import.meta.dirname, "..");

/**
 * Les avis — ce qui se vérifie sans base de données.
 *
 * Le gros du lot est gardé par `tests/rls-avis.test.ts`, qui interroge un vrai
 * Postgres en se faisant passer pour chacun. Ce fichier garde les deux choses
 * qui vivent en TypeScript : la validation du formulaire, et **l'accord entre
 * les constantes de l'interface et ce que fait réellement la base**.
 */

describe("le seuil de classement", () => {
  /**
   * ⚠️ **Deux endroits disent le même nombre, et rien ne les relie.**
   *
   * `listing_search.rating_sort` est nulle en dessous de trois avis, et
   * `getHomeSections` écarte les annonces sous le même seuil. `RATING_RANK_MIN`
   * ne commande ni l'un ni l'autre : c'est la **copie** affichée au client et
   * au partenaire (« ne compte pas encore dans le classement »).
   *
   * Si quelqu'un change le seuil dans la vue sans toucher la constante,
   * l'interface mentira sans qu'aucune erreur n'apparaisse — le pire genre de
   * divergence, parce que les deux côtés continuent de fonctionner. Ce test
   * lit la migration.
   */
  it("dit le même nombre que la vue de recherche", () => {
    const sql = readFileSync(join(racine, "supabase", "migrations", "0048_avis.sql"), "utf8");

    expect(sql).toContain(`when l.rating_count >= ${RATING_RANK_MIN} then l.rating_avg`);
  });

  it("dit le même nombre que la mise en avant de l'accueil", () => {
    const ts = readFileSync(join(racine, "src", "lib", "listings.ts"), "utf8");

    // La section « Les valeurs sûres » filtre sur la constante elle-même : ce
    // contrôle vérifie qu'elle n'a pas été remplacée par un nombre en dur.
    expect(ts).toContain('.gte("rating_count", RATING_RANK_MIN)');
  });

  it("trie sur rating_sort et jamais sur rating_avg", () => {
    // ⚠️ Le défaut que ce lot a dû corriger : trier sur `rating_avg` met en
    // tête une annonce notée 5 par un unique client — son premier, ou son plus
    // complaisant — devant une annonce à 4,8 sur cinquante avis.
    const ts = readFileSync(join(racine, "src", "lib", "listings.ts"), "utf8");
    const tri = ts.slice(ts.indexOf("switch (filters.sort)"), ts.indexOf("const { data, count"));

    expect(tri).toContain('.order("rating_sort"');
    expect(tri).not.toContain('.order("rating_avg"');
  });
});

describe("dépôt d'un avis", () => {
  it("accepte une note seule, sans commentaire", () => {
    // Exiger un texte ferait taire ceux qui n'ont rien de particulier à dire,
    // c'est-à-dire les clients satisfaits.
    const resultat = reviewSchema.safeParse({ orderId: UUID, rating: "5" });

    expect(resultat.success).toBe(true);
    expect(resultat.success && resultat.data.rating).toBe(5);
  });

  it("accepte un champ de texte vide comme une absence de texte", () => {
    // Un formulaire HTML envoie toujours la chaîne vide, jamais `undefined` :
    // sans cette tolérance, tout avis sans commentaire serait refusé.
    const resultat = reviewSchema.safeParse({ orderId: UUID, rating: 4, body: "   " });

    expect(resultat.success).toBe(true);
  });

  it("refuse un texte entamé mais illisible", () => {
    const resultat = reviewSchema.safeParse({ orderId: UUID, rating: 4, body: "Bof" });

    expect(resultat.success).toBe(false);
  });

  it("refuse une note hors de 1 à 5", () => {
    for (const rating of [0, 6, -1, 2.5]) {
      expect(reviewSchema.safeParse({ orderId: UUID, rating }).success, String(rating)).toBe(false);
    }
  });

  it("refuse un texte au-delà de la borne de la base", () => {
    // Les mêmes bornes qu'en base : un texte accepté ici et refusé là-bas
    // donnerait une erreur illisible après la soumission.
    const resultat = reviewSchema.safeParse({
      orderId: UUID,
      rating: 5,
      body: "a".repeat(REVIEW_BODY_MAX + 1),
    });

    expect(resultat.success).toBe(false);
    expect(reviewSchema.safeParse({ orderId: UUID, rating: 5, body: "a".repeat(REVIEW_BODY_MAX) }).success).toBe(true);
  });

  it("garde les bornes d'accord avec la base", () => {
    const sql = readFileSync(join(racine, "supabase", "migrations", "0048_avis.sql"), "utf8");

    expect(sql).toContain(
      `body text check (body is null or length(btrim(body)) between ${REVIEW_BODY_MIN} and ${REVIEW_BODY_MAX})`,
    );
  });
});

describe("réponse du prestataire", () => {
  it("exige un texte", () => {
    // On ne publie pas « le prestataire a répondu » sans rien à lire dessous.
    expect(reviewReplySchema.safeParse({ reviewId: UUID, reply: "" }).success).toBe(false);
    expect(reviewReplySchema.safeParse({ reviewId: UUID, reply: "   " }).success).toBe(false);
  });

  it("accepte une réponse brève mais lisible", () => {
    expect(reviewReplySchema.safeParse({ reviewId: UUID, reply: "Merci à vous !" }).success).toBe(
      true,
    );
  });
});

describe("motif de signalement", () => {
  it("exige le même minimum que la base", () => {
    const sql = readFileSync(join(racine, "supabase", "migrations", "0048_avis.sql"), "utf8");

    expect(sql).toContain(`if length(m) < ${REASON_MIN} then`);
  });
});

describe("affichage d'une note", () => {
  it("écrit « — » pour une note absente, jamais « 0 »", () => {
    // ⚠️ « Pas encore de donnée » et « zéro » ne s'écrivent pas pareil (§5 du
    // guide) : « 0 sur 5 » se lit comme un jugement sur un prestataire dont
    // personne ne s'est encore plaint.
    expect(formatRating(null)).toBe("—");
    expect(formatRating(undefined)).toBe("—");
  });

  it("écrit la note à la virgule française", () => {
    expect(formatRating(4.25)).toBe("4,3");
    expect(formatRating(5)).toBe("5,0");
  });
});
