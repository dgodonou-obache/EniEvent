/**
 * Expiration de session par inactivité.
 *
 * Supabase sait le faire, mais seulement à partir du forfait payant — et avec
 * **une seule durée pour tout le monde**. Or une session de particulier
 * oubliée sur un téléphone et une session d'administration ne méritent pas le
 * même égard : la seconde ouvre le back-office entier.
 *
 * Le principe : un horodatage d'activité, **signé**, déposé en cookie à côté
 * de la session. Le proxy le relit à chaque requête ; passé le délai, il
 * déconnecte. Signé, parce qu'un simple nombre serait modifiable depuis la
 * console du navigateur — il suffirait de le repousser pour ne jamais expirer.
 *
 * Pas de table, pas d'écriture en base : le proxy s'exécute à **chaque**
 * requête, y compris sur les images et les pages publiques. Un aller-retour
 * vers Postgres à cet endroit se paierait sur chaque chargement, et sur les
 * connexions mobiles béninoises ce n'est pas un détail.
 *
 * Ce que cela protège : une session abandonnée sur un appareil partagé — un
 * cybercafé, un téléphone prêté — finit par mourir d'elle-même. Ce que cela ne
 * protège pas : quelqu'un qui vole l'ensemble des cookies emporte aussi
 * l'horodatage. Contre cela, seule la rotation des jetons de rafraîchissement
 * aide, et elle est déjà active.
 */

export const ACTIVITY_COOKIE = "ee-activity";

/** Délais, en secondes. */
export const INACTIVITY = {
  /** Espaces courants : deux semaines sans revenir, et il faut se reconnecter. */
  default: 14 * 24 * 60 * 60,
  /**
   * Back-office : une heure. C'est là que se décident les validations, les
   * remboursements et les statuts ; une session d'administration laissée
   * ouverte est le pire des oublis.
   */
  admin: 60 * 60,
} as const;

/** Le délai applicable à une route. */
export function timeoutFor(pathname: string): number {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? INACTIVITY.admin
    : INACTIVITY.default;
}

const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valeur de cookie : `<horodatage>.<signature>`. */
export async function stamp(secret: string, at: number = Date.now()): Promise<string> {
  const seconds = Math.floor(at / 1000);
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(String(seconds)));
  return `${seconds}.${toHex(signature)}`;
}

export type ActivityCheck =
  | { state: "absent" }
  | { state: "invalide" }
  | { state: "expiré"; idleSeconds: number }
  | { state: "actif"; idleSeconds: number };

/**
 * Relit un horodatage. Un cookie absent n'est pas une faute — c'est le cas
 * d'une session ouverte avant la mise en place, ou d'un cookie effacé : on le
 * repose, on ne déconnecte pas.
 */
export async function check(
  secret: string,
  value: string | undefined,
  timeoutSeconds: number,
  now: number = Date.now(),
): Promise<ActivityCheck> {
  if (!value) return { state: "absent" };

  const [seconds, signature] = value.split(".");
  if (!seconds || !signature || !/^\d+$/.test(seconds)) return { state: "invalide" };

  const attendu = await stamp(secret, Number(seconds) * 1000);
  // Comparaison en temps constant : une comparaison naïve fuit, octet par
  // octet, de quoi reconstruire une signature valide.
  if (!constantTimeEqual(attendu, value)) return { state: "invalide" };

  const idleSeconds = Math.floor(now / 1000) - Number(seconds);

  // Un horodatage dans le futur trahit une horloge faussée ou un cookie
  // bricolé : on le traite comme invalide plutôt que d'accorder du sursis.
  if (idleSeconds < -60) return { state: "invalide" };

  return idleSeconds > timeoutSeconds
    ? { state: "expiré", idleSeconds }
    : { state: "actif", idleSeconds };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Le cookie n'est réécrit que si l'horodatage a vieilli d'une minute.
 * Sans ce seuil, chaque requête d'une page — images comprises — renverrait un
 * `Set-Cookie`, pour rien.
 */
export const REFRESH_AFTER_SECONDS = 60;
