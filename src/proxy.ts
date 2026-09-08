import { type NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

/**
 * Anciennement `middleware.ts` : Next 16 a renommé la convention en `proxy`.
 * Rôle inchangé — rafraîchir la session Supabase à chaque requête et barrer
 * l'accès aux espaces protégés aux visiteurs non authentifiés.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf : fichiers statiques, images optimisées, favicon,
     * fichiers de métadonnées et images servies depuis /public.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
