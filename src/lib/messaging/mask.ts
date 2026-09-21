/**
 * Masquage des coordonnées dans un message.
 *
 * **Ce module double `app.mask_contacts`** (migration 0037), comme `fees.ts`
 * double la ventilation SQL et `cancellation.ts` le barème d'annulation. La
 * base fait foi — c'est elle qui masque ce qui sort de `read_conversation`,
 * et un appel direct ne peut pas la contourner. Celui-ci sert à **prévenir
 * l'utilisateur pendant qu'il tape** : découvrir après envoi que son numéro
 * n'est pas passé se lit comme une panne, alors que c'est une règle.
 *
 * Toute divergence entre les deux est un bug, et `tests/rls-messagerie.test.ts`
 * compare les deux sur le même corpus.
 *
 * ⚠️ **C'est un ralentisseur, pas un mur.** « zéro un quatre-vingt-dix-sept »
 * passera toujours, et c'est assumé : le but est de rendre le contournement
 * volontaire et visible, pas de le rendre impossible. Ne jamais s'y fier comme
 * à une serrure — la vraie protection est que la commission se prélève sur un
 * encaissement, pas sur une promesse.
 */

export const MASQUE_NUMERO = "[numéro masqué]";
export const MASQUE_ADRESSE = "[adresse masquée]";

/**
 * Les trois formes visées, dans l'ordre exact du SQL — l'ordre compte : une
 * adresse contient parfois des chiffres, elle se masque donc en premier.
 */
const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Indicatif international du Bénin, suivi de 8 à 10 chiffres. */
const INTERNATIONAL = /(\+|00)[\s.-]*229(?:[\s.-]*\d){8,10}/g;

/**
 * Format national à dix chiffres, en vigueur depuis le 30 novembre 2024.
 *
 * Le premier chiffre **nul** est ce qui distingue un numéro d'un montant :
 * un prix ne commence pas par zéro, un numéro béninois toujours. Sans cette
 * exigence, « 150 000 000 FCFA » partirait masqué — et une messagerie où l'on
 * ne peut pas annoncer un budget ne sert à rien.
 */
const NATIONAL = /\b0[1-9](?:[\s.-]*\d){8}\b/g;

/** Remplace numéros et adresses. Double exact de `app.mask_contacts`. */
export function maskContacts(texte: string): string {
  return (texte ?? "")
    .replace(ADRESSE, MASQUE_ADRESSE)
    .replace(INTERNATIONAL, MASQUE_NUMERO)
    .replace(NATIONAL, MASQUE_NUMERO);
}

/**
 * Le texte contient-il quelque chose qui sera masqué ?
 *
 * Sert à l'avertissement affiché sous la zone de saisie. On compare le résultat
 * plutôt que de rejouer les expressions : deux façons de poser la même question
 * finiraient par diverger.
 */
export function containsContact(texte: string): boolean {
  return maskContacts(texte) !== texte;
}
