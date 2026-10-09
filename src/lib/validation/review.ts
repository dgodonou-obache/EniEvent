import { z } from "zod";

/**
 * Avis — validation partagée, et les deux constantes que l'interface doit dire.
 *
 * ⚠️ **Module neutre, sans `server-only`.** Ces valeurs traversent la frontière
 * serveur → client : le formulaire les affiche, la Server Action les vérifie. Un
 * fichier `"use server"` ne peut exporter que des fonctions asynchrones, et une
 * constante y serait silencieusement retirée du module servi au navigateur
 * (§6 du guide).
 */

/**
 * Nombre d'avis à partir duquel une note **pèse sur le classement**.
 *
 * Le tri par défaut du catalogue est `rating_avg desc`. Sans seuil, le premier
 * avis déposé réordonne tout le catalogue : un unique « 5 » battrait une
 * annonce notée 4,8 sur cinquante avis. En dessous, la note **s'affiche** mais
 * `listing_search.rating_sort` est nulle (migration 0048) et l'annonce garde
 * son rang.
 *
 * Cette constante ne commande rien — c'est la vue qui tranche. Elle existe
 * pour que l'écran dise exactement ce que fait la base, et
 * `tests/reviews.test.ts` vérifie qu'elles ne divergent pas.
 */
export const RATING_RANK_MIN = 3;

/** Bornes du texte, les mêmes qu'en base (`reviews.body`, `reviews.reply`). */
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 2000;

const texteFacultatif = z
  .string()
  .trim()
  .max(REVIEW_BODY_MAX, `Votre avis ne peut pas dépasser ${REVIEW_BODY_MAX} caractères.`)
  .refine(
    (valeur) => valeur.length === 0 || valeur.length >= REVIEW_BODY_MIN,
    `Écrivez au moins ${REVIEW_BODY_MIN} caractères, ou laissez le champ vide.`,
  )
  .optional();

/**
 * Dépôt d'un avis.
 *
 * Le texte est **facultatif** : une note seule est un avis valable, et exiger
 * un commentaire ferait taire ceux qui n'ont rien de particulier à dire —
 * c'est-à-dire les clients satisfaits. En revanche un texte entamé doit être
 * lisible, d'où le minimum une fois qu'on a commencé à écrire.
 */
export const reviewSchema = z.object({
  orderId: z.string().uuid("Réservation introuvable."),
  rating: z.coerce
    .number()
    .int("Choisissez une note de 1 à 5.")
    .min(1, "Choisissez une note de 1 à 5.")
    .max(5, "Choisissez une note de 1 à 5."),
  body: texteFacultatif,
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/**
 * Réponse du prestataire — obligatoire, elle.
 *
 * On ne publie pas une réponse vide sous un avis : elle occuperait la place
 * sans rien dire, et le client verrait « le prestataire a répondu » sans rien
 * à lire.
 */
export const reviewReplySchema = z.object({
  reviewId: z.string().uuid("Avis introuvable."),
  reply: z
    .string()
    .trim()
    .min(REVIEW_BODY_MIN, `Écrivez au moins ${REVIEW_BODY_MIN} caractères.`)
    .max(REVIEW_BODY_MAX, `Votre réponse ne peut pas dépasser ${REVIEW_BODY_MAX} caractères.`),
});

/** Motif de signalement ou de modération. Quinze caractères, comme en base. */
export const REASON_MIN = 15;

export const reportSchema = z.object({
  reviewId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  reason: z
    .string()
    .trim()
    .min(REASON_MIN, `Expliquez en au moins ${REASON_MIN} caractères ce qui pose problème.`)
    .max(REVIEW_BODY_MAX, "Motif trop long."),
});
