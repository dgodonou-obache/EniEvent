import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/validation/redirect";
import { createClient } from "@/utils/supabase/server";

/**
 * Retour de confirmation d'e-mail et de lien magique.
 *
 * Supabase renvoie ici avec un `code` à échanger contre une session. En cas
 * d'échec — lien expiré, déjà utilisé — on renvoie vers la connexion avec un
 * motif, plutôt que d'afficher une page blanche.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("suivant");

  // Une destination venue de l'URL ne doit jamais pouvoir sortir du site.
  // ⚠️ Le contrôle à la main qui se trouvait ici laissait passer `/\evil.com`.
  const destination = safeInternalPath(next, "/compte");

  if (!code) {
    return NextResponse.redirect(new URL("/connexion?erreur=lien-invalide", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/connexion?erreur=lien-expire", origin));
  }

  return NextResponse.redirect(new URL(destination, origin));
}
