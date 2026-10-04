/**
 * Prolonger la session après un geste réel de l'utilisateur.
 *
 * **Cette route ne fait rien, et c'est voulu.** L'horodatage d'activité est
 * posé par le proxy, qui s'exécute avant tout gestionnaire : il suffit qu'une
 * requête passe pour que la session soit repoussée. Écrire la logique ici
 * l'aurait dupliquée — avec la garantie qu'elle finirait par diverger de celle
 * du proxy, seule à faire autorité.
 *
 * Elle existe parce qu'une page lue sans être quittée n'émet aucune requête :
 * `SessionTimeout` appelle donc celle-ci, au plus une fois par minute, quand il
 * constate une activité. Sans elle, remplir un long formulaire compterait pour
 * de l'inactivité.
 *
 * Aucune donnée, aucun corps de réponse : un `204` est la réponse complète.
 * Une session absente ou expirée n'est pas un cas d'erreur à traiter ici — le
 * proxy a déjà tranché avant d'arriver jusqu'ici.
 */
export async function POST() {
  return new Response(null, { status: 204 });
}
