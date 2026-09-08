import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Espaces protégés et page de connexion associée.
 *
 * Le middleware ne vérifie **que l'authentification**. L'autorisation fine
 * (appartenance à une organisation, rôle dans cette organisation, statut admin)
 * est faite dans le layout serveur de chaque espace : elle demande des jointures
 * qui n'ont pas leur place à chaque requête en edge, et un refus doit afficher
 * une vraie page d'explication plutôt qu'une redirection muette.
 *
 * Règle d'isolation (héritée de la v1) : un espace ne redirige jamais vers la
 * page de connexion d'un autre. Un partenaire déconnecté atterrit sur
 * `/pro/connexion`, jamais sur `/connexion`.
 */
const PROTECTED_SPACES = [
  { prefix: "/admin", signIn: "/connexion" },
  { prefix: "/pro", signIn: "/pro/connexion" },
  { prefix: "/entreprise", signIn: "/connexion" },
  { prefix: "/compte", signIn: "/connexion" },
  { prefix: "/projets", signIn: "/connexion" },
] as const;

/** Pages accessibles sans session à l'intérieur d'un espace protégé. */
const PUBLIC_EXCEPTIONS = [
  "/pro/connexion",
  "/pro/inscription",
  "/pro/mot-de-passe-oublie",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Rafraîchit le jeton. À appeler avant toute lecture de `request.cookies`,
  // sinon la session peut expirer en cours de rendu.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (PUBLIC_EXCEPTIONS.some((route) => pathname.startsWith(route))) {
    return supabaseResponse;
  }

  const space = PROTECTED_SPACES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (space && !user) {
    const signInUrl = new URL(space.signIn, request.url);
    // Mémorise la destination pour y revenir après connexion.
    signInUrl.searchParams.set("suivant", pathname + request.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse;
}
