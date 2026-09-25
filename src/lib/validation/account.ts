/**
 * Suppression de compte : ce que les deux côtés doivent connaître.
 *
 * ⚠️ **Ce module existe parce qu'un fichier `"use server"` ne peut exporter
 * que des fonctions asynchrones.** Une constante y est silencieusement retirée
 * du module servi au navigateur : le composant client qui l'importe échoue à
 * l'exécution sur « Export CONFIRMATION doesn't exist in target module ».
 *
 * Ni `tsc` ni `eslint` ne le voient — c'est du même ordre que la sérialisation
 * RSC (guide §6), et c'est `npm run smoke:ecrans` qui l'a attrapé, en rendant
 * réellement `/compte/profil`.
 *
 * Il ne porte pas `import "server-only"` non plus : il doit précisément
 * traverser la frontière. D'où sa place dans `validation/`, où vivent déjà les
 * modules purs partagés par les deux côtés.
 */

/**
 * Le mot à saisir pour confirmer.
 *
 * Un second clic ne suffit pas : la suppression est immédiate et sans retour.
 * C'est la seule friction de ce niveau dans le dépôt, et elle est
 * proportionnée — une annulation de réservation se rattrape par un appel, la
 * suppression d'un compte non.
 */
export const DELETE_ACCOUNT_CONFIRMATION = "SUPPRIMER";
