/**
 * Filtrage des destinations venues de l'URL.
 *
 * Quatre endroits mémorisent où renvoyer quelqu'un après une connexion, une
 * confirmation d'adresse ou une déconnexion — et tous lisent ce chemin dans un
 * paramètre que n'importe qui peut écrire. Sans filtre, un lien qui commence
 * vraiment par `https://enievent.com/…` finit sur une fausse page de connexion.
 * C'est l'usage classique d'une redirection ouverte : l'hameçonnage emprunte un
 * domaine de confiance.
 *
 * ⚠️ **Le filtre précédent se laissait franchir par un simple anti-slash.** Il
 * vérifiait `startsWith("/") && !startsWith("//")`, ce qui paraît suffisant et
 * ne l'est pas : le parseur d'URL traite `\` comme `/` pour les schémas http et
 * https. Mesuré avant correctif —
 *
 *     "/\evil.com"   filtre : PASSE   →   origine : https://evil.com
 *
 * — alors que `//evil.com`, la forme à laquelle on pense, était bien bloquée.
 *
 * ⚠️ **D'où la règle : on ne juge pas une URL en lisant ses premiers
 * caractères, on la fait analyser puis on regarde où elle mène.** Les
 * contrôles de chaîne ci-dessous ne sont qu'un premier tri ; c'est la
 * comparaison d'origine qui décide. Un parseur connaît les cas tordus —
 * anti-slash, caractères de contrôle, double encodage — qu'une expression
 * régulière écrite à la main redécouvrira un par un, trop tard.
 *
 * Module neutre, sans `server-only` : `SignInForm` est un composant client, et
 * la règle doit être la même des deux côtés de la frontière (§6 du guide).
 */

/**
 * Origine arbitraire servant de repère à l'analyse.
 *
 * Le `.invalid` est réservé par la RFC 2606 et ne peut appartenir à personne :
 * si une destination forgée parvenait à s'en échapper, elle n'atterrirait pas
 * sur un domaine que quelqu'un pourrait enregistrer.
 */
const REPERE = "https://enievent.invalid";

/** Anti-slash, guillemets et caractères de contrôle : jamais dans un chemin légitime. */
const CARACTERES_INTERDITS = /[\\"'<>\u0000-\u001f\u007f-\u009f]/;

/**
 * Rend un chemin interne sûr, ou le repli.
 *
 * Le chemin rendu est celui **recomposé par le parseur**, pas celui reçu : les
 * traversées (`/a/../../b`) et les doubles barres y sont déjà résolues, et ce
 * qui sort est donc toujours une forme canonique.
 */
export function safeInternalPath(valeur: unknown, repli: string): string {
  if (typeof valeur !== "string" || valeur === "") return repli;

  // Premier tri, peu coûteux : une destination interne commence par une barre
  // unique et ne contient rien d'exotique.
  if (!valeur.startsWith("/")) return repli;
  if (CARACTERES_INTERDITS.test(valeur)) return repli;

  let analysee: URL;
  try {
    analysee = new URL(valeur, REPERE);
  } catch {
    return repli;
  }

  // Le contrôle qui compte. `//evil.com` comme `/\evil.com` changent d'origine
  // ici, quelle que soit l'astuce employée pour y arriver.
  if (analysee.origin !== REPERE) return repli;

  return `${analysee.pathname}${analysee.search}${analysee.hash}`;
}
