import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Client Supabase pour les composants client. Ne porte que la clé anonyme. */
export function createClient() {
  const env = publicEnv();

  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey);
}
