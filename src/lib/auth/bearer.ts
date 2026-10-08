import { timingSafeEqual } from "node:crypto";

/**
 * Vérification d'un jeton porteur, en temps constant.
 *
 * ⚠️ **Une comparaison `!==` s'arrête au premier octet qui diffère.** Le temps
 * de réponse dit donc combien de caractères de tête sont justes, et un secret
 * se reconstitue caractère par caractère. À travers l'Internet, la gigue de
 * réseau noie le signal et l'attaque reste difficile — mais « difficile » n'est
 * pas une garantie, et ce code ne coûte rien.
 *
 * Le dépôt savait déjà le faire : le webhook FedaPay vérifie sa signature avec
 * `timingSafeEqual` depuis le début. Les deux tâches planifiées, elles,
 * comparaient avec `!==`. L'asymétrie n'avait aucune raison d'être.
 *
 * ⚠️ `timingSafeEqual` **lève** si les deux tampons n'ont pas la même longueur,
 * et comparer les longueurs d'abord fuit déjà la longueur du secret. On rembourre
 * donc les deux côtés à une taille fixe avant de comparer, et la différence de
 * longueur est traitée comme une différence de contenu.
 */

/** Plus long que tout secret raisonnable ; tout est ramené à cette taille. */
const TAILLE = 256;

function rembourre(valeur: string): Buffer {
  const plein = Buffer.alloc(TAILLE);
  Buffer.from(valeur, "utf8").copy(plein, 0, 0, TAILLE);
  return plein;
}

/**
 * Vrai quand l'en-tête `Authorization` porte exactement `Bearer <secret>`.
 *
 * Un en-tête absent est traité comme une valeur fausse, et non court-circuité :
 * le chemin d'exécution reste le même, qu'on présente un jeton ou rien.
 */
export function bearerMatches(header: string | null, secret: string): boolean {
  const attendu = rembourre(`Bearer ${secret}`);
  const recu = rembourre(header ?? "");

  // La longueur est déjà uniformisée : seule la différence de contenu décide.
  return timingSafeEqual(attendu, recu) && (header ?? "").length === `Bearer ${secret}`.length;
}
