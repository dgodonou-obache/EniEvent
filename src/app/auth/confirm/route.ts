import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { homeFor } from "@/lib/auth/home";
import { createClient } from "@/utils/supabase/server";

/**
 * Arrivée des liens envoyés par courriel.
 *
 * **Remplace `/auth/callback` pour tout ce qui vient d'un e-mail**, et la
 * raison est structurelle — pas un réglage à corriger.
 *
 * Le chemin précédent passait par `{{ .ConfirmationURL }}`, que Supabase
 * résout en un `/auth/v1/verify` qui renvoie ensuite chez nous. Deux façons de
 * porter la session en reviennent, et **aucune ne convenait** :
 *
 * 1. **Le fragment** (`#access_token=…`), employé dès qu'aucun défi PKCE n'a
 *    été posé. ⚠️ Un fragment n'est **jamais transmis au serveur** : le
 *    navigateur le retire avant d'émettre la requête. Une route serveur ne peut
 *    pas le lire, quoi qu'elle fasse. Mesuré :
 *
 *        303 → /auth/callback?suivant=…#access_token=eyJ…
 *        307 → /connexion?erreur=lien-invalide
 *
 * 2. **Le code PKCE** (`?code=`), employé quand la demande vient du navigateur.
 *    Son échange exige le **vérificateur**, déposé en cookie par le navigateur
 *    qui a fait la demande. Or on ouvre ses courriels là où ils arrivent :
 *    l'application Gmail ouvre son propre navigateur, qui n'a pas ce cookie.
 *    L'échange échoue, et l'utilisateur lit « ce lien n'est plus valable »
 *    alors qu'il vient de le recevoir.
 *
 * `verifyOtp` avec un `token_hash` n'a aucun de ces deux défauts : tout arrive
 * en paramètre de requête, rien n'exige de cookie préalable, et le lien
 * fonctionne donc depuis n'importe quel appareil. C'est le chemin que Supabase
 * documente pour le rendu côté serveur.
 *
 * `/auth/callback` reste en place pour les retours porteurs d'un `?code=`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const suivant = searchParams.get("suivant");

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/connexion?erreur=lien-invalide", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Un lien déjà employé et un lien périmé se ressemblent du point de vue de
    // l'utilisateur : dans les deux cas, il lui en faut un nouveau.
    return NextResponse.redirect(new URL("/connexion?erreur=lien-expire", origin));
  }

  // Une destination venue de l'URL ne doit jamais pouvoir sortir du site.
  if (suivant && suivant.startsWith("/") && !suivant.startsWith("//")) {
    return NextResponse.redirect(new URL(suivant, origin));
  }

  // À défaut, chacun chez soi : envoyer un partenaire sur `/compte` lui ferait
  // croire qu'il s'est trompé de compte.
  const accountType = data.user?.user_metadata?.account_type;
  const destination = typeof accountType === "string" ? homeFor(accountType as never) : "/compte";

  return NextResponse.redirect(new URL(destination, origin));
}
