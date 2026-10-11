import { NextResponse, type NextRequest } from "next/server";

import { ACTIVITY_COOKIE } from "@/lib/auth/inactivity";
import { safeInternalPath } from "@/lib/validation/redirect";
import { createClient } from "@/utils/supabase/server";

/**
 * Déconnexion par **navigation**, et non par Server Action.
 *
 * ⚠️ **C'est la correction d'un défaut mesuré, pas un doublon de commodité.**
 * La coupure pour inactivité passait par la Server Action `signOut`. Mesuré en
 * forgeant un horodatage expiré mais correctement signé — l'état exact d'un
 * onglet laissé ouvert :
 *
 *     navigation classique   307 → /pro/connexion?raison=inactivite   puis 200, explication affichée
 *     Server Action (POST)   307 → rePOST → 404 « Server action not found. »
 *
 * Le 307 **conserve la méthode** : le navigateur rejoue le POST, en-tête
 * `Next-Action` compris, sur la page de connexion — qui ne connaît pas cette
 * action. Next affiche alors son écran « This page couldn't load », que
 * l'utilisateur lit comme une panne d'ÉniEvent.
 *
 * Et ce n'était pas un cas rare : **le chemin prévu était précisément celui qui
 * échouait**. Le proxy ne réécrit l'horodatage qu'une fois par minute
 * (`REFRESH_AFTER_SECONDS`) et `SessionTimeout` n'appelle `/api/session` qu'une
 * fois par minute : la référence du serveur est donc structurellement plus
 * ancienne que celle du navigateur. Quand le compte à rebours de l'écran arrive
 * à zéro, le proxy a déjà tranché.
 *
 * **Un GET supprime la course au lieu de la réduire.** Cette route n'est sous
 * aucun espace protégé : le proxy, même quand il constate l'expiration, se
 * contente d'effacer les cookies et laisse passer (`enforceInactivity` ne
 * déroute que dans un espace protégé). Le gestionnaire s'exécute donc toujours,
 * que la session soit encore vivante ou déjà coupée, et la destination est
 * atteinte dans les deux cas.
 */

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  // ⚠️ Jamais de filtrage à la main : `safeInternalPath` analyse l'adresse et
  // compare l'origine. `/\evil.com` franchissait l'ancien contrôle.
  const destination = safeInternalPath(searchParams.get("suivant"), "/connexion");

  const supabase = await createClient();

  // Peut échouer si la session est déjà tombée — c'est le cas nominal ici, et
  // il n'a rien d'une erreur : on efface ce qui reste et on poursuit.
  await supabase.auth.signOut().catch(() => {});

  const reponse = NextResponse.redirect(new URL(destination, origin));

  // ⚠️ **Une réponse neuve n'hérite d'aucun `Set-Cookie`** (même piège que dans
  // le proxy) : `signOut` a écrit ses effacements sur la réponse que Next
  // aurait rendue, pas sur celle-ci. On les repose nommément, sinon une
  // déconnexion laisserait la session intacte tout en affichant la page de
  // connexion — le pire des deux mondes.
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-") || name === ACTIVITY_COOKIE) reponse.cookies.delete(name);
  }

  return reponse;
}
