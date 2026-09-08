import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv, secretKey } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 *
 * `cookies()` est asynchrone depuis Next 15 : cette fonction l'est donc aussi.
 * L'écriture de cookies échoue silencieusement quand elle est appelée depuis un
 * Server Component (React l'interdit) — c'est sans conséquence, le proxy
 * rafraîchit la session à chaque requête.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component : ignoré, cf. commentaire ci-dessus.
          }
        },
      },
    },
  );
}

/**
 * Client à privilèges élevés, réservé aux webhooks de paiement et aux tâches
 * planifiées. Contourne la RLS : ne jamais l'importer depuis un composant, une
 * Server Action déclenchée par l'utilisateur, ou du code atteignable côté client.
 */
export function createServiceRoleClient() {
  const env = publicEnv();

  return createServerClient<Database>(env.supabaseUrl, secretKey(), {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
