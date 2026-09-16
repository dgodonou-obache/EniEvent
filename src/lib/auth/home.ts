import type { AccountType } from "@/lib/auth/access";

/**
 * Où mène « Mon espace » depuis le site public.
 *
 * Chaque type de compte a son espace, et le lien doit y conduire directement :
 * envoyer un partenaire sur `/compte` lui ferait croire qu'il s'est trompé de
 * compte. C'est l'unique passage du site public vers un espace — l'inverse
 * reste interdit (`CLAUDE.md` §4 : aucun lien « retour au site » dans un
 * back-office).
 */
export const HOME_BY_ACCOUNT_TYPE: Record<AccountType, string> = {
  particulier: "/compte",
  entreprise: "/entreprise",
  partenaire: "/pro/dashboard",
  admin: "/admin",
};

export function homeFor(accountType: AccountType): string {
  return HOME_BY_ACCOUNT_TYPE[accountType] ?? "/compte";
}

/** Ce que le site public affiche d'un visiteur connecté. Sérialisable : aucune fonction. */
export interface HeaderAccount {
  /** Prénom ou nom d'usage, déjà raccourci pour tenir dans un bouton. */
  name: string;
  href: string;
}
