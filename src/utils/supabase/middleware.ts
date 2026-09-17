import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  ACTIVITY_COOKIE,
  INACTIVITY,
  REFRESH_AFTER_SECONDS,
  check,
  stamp,
  timeoutFor,
} from "@/lib/auth/inactivity";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Espaces protégés et page de connexion associée.
 *
 * Le proxy vérifie l'authentification partout, et **l'autorisation pour le seul
 * `/admin`**. Les autres espaces décident dans leur layout serveur : leurs
 * contrôles demandent des jointures qui n'ont pas leur place à chaque requête.
 * Le back-office fait exception parce qu'un layout n'empêche pas une page de
 * s'exécuter — voir le bloc dédié plus bas.
 *
 * Règle d'isolation (héritée de la v1) : un espace ne redirige jamais vers la
 * page de connexion d'un autre. Un partenaire déconnecté atterrit sur
 * `/pro/connexion`, jamais sur `/connexion`.
 */
const PROTECTED_SPACES = [
  { prefix: "/admin", signIn: "/admin/connexion" },
  { prefix: "/pro", signIn: "/pro/connexion" },
  { prefix: "/entreprise", signIn: "/connexion" },
  { prefix: "/compte", signIn: "/connexion" },
  { prefix: "/projets", signIn: "/connexion" },
] as const;

/** Pages accessibles sans session à l'intérieur d'un espace protégé. */
const PUBLIC_EXCEPTIONS = [
  // L'administration a sa propre porte : la page grand public proposait de
  // créer un compte client ou partenaire, ce qui n'a aucun sens ici.
  "/admin/connexion",
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

  // Expiration par inactivité. Après `getUser`, donc après un éventuel
  // rafraîchissement : une session que Supabase vient de renouveler peut très
  // bien être restée inutilisée deux semaines.
  if (user) {
    const verdict = await enforceInactivity(request, supabaseResponse, pathname);
    if (verdict) return verdict;
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

  // -------------------------------------------------------------------------
  // Le back-office se refuse **ici**, pas dans son layout.
  //
  // Page et layout se rendent en parallèle dans l'App Router : un layout qui
  // renvoie un refus au lieu de ses enfants empêche l'affichage, mais **pas
  // l'exécution de la page**. Les requêtes d'administration partaient donc pour
  // tout utilisateur connecté qui tapait /admin, et leur rendu se retrouvait
  // dans la charge RSC du document.
  //
  // Rien ne fuyait — la page s'exécutait avec les droits du visiteur, la RLS
  // filtrait — mais la première page d'administration employant la clé de
  // service aurait fui pour de bon. Une réécriture coupe court : la page ne
  // s'exécute jamais, et l'URL reste la même, ce qui évite de faire croire à
  // une session expirée.
  // -------------------------------------------------------------------------
  if (user && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.account_type !== "admin") {
      const refus = new URL("/acces-refuse", request.url);
      refus.searchParams.set("espace", "admin");
      refus.searchParams.set("motif", "not-admin");
      return NextResponse.rewrite(refus);
    }
  }

  return supabaseResponse;
}

/**
 * Applique le délai d'inactivité et entretient l'horodatage.
 *
 * Renvoie une réponse **seulement** pour couper la session ; `null` signifie
 * « laisse passer ». Toute erreur imprévue laisse passer aussi : une session
 * expirée à tort vaut mieux qu'un site entier en panne, et ce code s'exécute
 * sur chaque requête.
 */
async function enforceInactivity(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): Promise<NextResponse | null> {
  const secret = process.env.SESSION_SECRET;

  // Sans secret, on ne signe rien et on ne prétend rien : le délai est
  // simplement inactif. Mieux vaut cela qu'une signature vide, qui donnerait
  // l'illusion d'une protection tout en se laissant forger.
  if (!secret) return null;

  try {
    const timeout = timeoutFor(pathname);
    const verdict = await check(secret, request.cookies.get(ACTIVITY_COOKIE)?.value, timeout);

    if (verdict.state === "expiré" || verdict.state === "invalide") {
      const signIn = PROTECTED_SPACES.find(
        ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )?.signIn;

      // Hors d'un espace protégé, inutile de dérouter la navigation : on coupe
      // la session, la page publique s'affiche normalement.
      const out = signIn
        ? NextResponse.redirect(new URL(`${signIn}?raison=inactivite`, request.url))
        : NextResponse.next({ request });

      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith("sb-") || name === ACTIVITY_COOKIE) out.cookies.delete(name);
      }

      return out;
    }

    // Réécrit l'horodatage, mais pas à chaque requête : le proxy passe aussi
    // sur les appels de données et les pages publiques.
    if (verdict.state === "absent" || verdict.idleSeconds >= REFRESH_AFTER_SECONDS) {
      response.cookies.set(ACTIVITY_COOKIE, await stamp(secret), {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: INACTIVITY.default,
      });
    }

    return null;
  } catch {
    return null;
  }
}
