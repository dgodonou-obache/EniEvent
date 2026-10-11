import { createClient } from "@/utils/supabase/server";

/**
 * Prolonger la session après un geste réel, et dire si elle tient encore.
 *
 * **L'horodatage n'est pas posé ici, et c'est voulu.** C'est le proxy qui
 * l'écrit, avant tout gestionnaire : il suffit qu'une requête passe pour que la
 * session soit repoussée. Dupliquer la logique ici la ferait diverger de celle
 * du proxy, seule à faire autorité.
 *
 * Cette route existe parce qu'une page lue sans être quittée n'émet aucune
 * requête : `SessionTimeout` l'appelle, au plus une fois par minute, quand il
 * constate une activité. Sans elle, remplir un long formulaire compterait pour
 * de l'inactivité.
 *
 * ⚠️ **Le code de retour, lui, porte une information** — et c'est nouveau. Il
 * répondait 204 en toutes circonstances, y compris sur une session déjà
 * coupée : personne ne pouvait donc distinguer « tout va bien » de « vous êtes
 * déjà dehors ». `SessionExpiree` s'en sert pour savoir quoi écrire quand une
 * action échoue — dire « votre session a expiré » sur une vraie panne serait
 * un mensonge, et dire « une erreur est survenue » sur une session tombée
 * envoie chercher un problème qui n'existe pas.
 *
 *   204  la session tient
 *   401  il n'y en a plus
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return new Response(null, { status: user ? 204 : 401 });
}
