import { z } from "zod";

/**
 * Validation des variables d'environnement.
 *
 * Sans elle, une clé Supabase absente se manifeste par un « Your project's URL
 * and Key are required » levé depuis le proxy — donc une erreur 500 sur *toutes*
 * les pages, y compris la vitrine publique, sans indiquer quoi corriger. Ici
 * l'échec nomme la variable manquante et renvoie vers `.env.example`.
 *
 * Les variables `NEXT_PUBLIC_*` sont lues littéralement : Next les remplace à la
 * compilation, un accès dynamique `process.env[nom]` ne serait pas substitué.
 *
 * Deux générations de clés cohabitent chez Supabase. Les nouvelles
 * (`sb_publishable_…` / `sb_secret_…`) sont le standard ; les anciennes
 * (`anon` / `service_role`, longs JWT commençant par `eyJ`) sont dépréciées et
 * s'éteignent fin 2026. On privilégie les nouvelles, sans casser un projet qui
 * n'expose encore que les anciennes.
 */

const schema = z.object({
  supabaseUrl: z.url("doit être une URL valide, ex. https://xxxx.supabase.co"),
  supabaseKey: z
    .string("est absente")
    .min(1, "est vide"),
});

type Env = z.infer<typeof schema>;

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  const labels: Record<string, string> = {
    supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
    supabaseKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  };

  const details = issues
    .map((issue) => {
      const key = String(issue.path[0] ?? "");
      return `  - ${labels[key] ?? key} ${issue.message}`;
    })
    .join("\n");

  return [
    "Configuration d'environnement invalide :",
    details,
    "",
    "Copiez .env.example vers .env.local et renseignez les valeurs manquantes.",
    "Elles se trouvent dans le tableau de bord Supabase, Settings > API Keys.",
  ].join("\n");
}

let cached: Env | null = null;

/** Configuration Supabase publique. Utilisable côté serveur comme côté client. */
export function publicEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(formatIssues(parsed.error.issues));
  }

  cached = parsed.data;
  return cached;
}

/**
 * Clé serveur. Volontairement séparée : elle contourne la RLS et ne doit jamais
 * être atteignable depuis un bundle client — d'où l'absence de préfixe
 * `NEXT_PUBLIC_`, qui la publierait dans le navigateur.
 */
export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      [
        "Configuration d'environnement invalide :",
        "  - SUPABASE_SECRET_KEY est absente (requise pour les webhooks et les tâches planifiées)",
        "",
        "Tableau de bord Supabase, Settings > API Keys, clé « secret » (sb_secret_…).",
      ].join("\n"),
    );
  }

  return key;
}
