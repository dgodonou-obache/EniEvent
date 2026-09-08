/**
 * Numéros de téléphone béninois.
 *
 * Depuis le 30 novembre 2024, le Bénin est passé à 10 chiffres : tous les
 * numéros sont préfixés de `01`. Un ancien numéro à 8 chiffres (97 00 00 01)
 * n'est plus composable, et l'accepter dans un formulaire produirait des
 * fiches prestataires injoignables.
 *
 * Trois opérateurs : MTN, Moov Africa, Celtiis.
 */

const SEPARATORS = /[\s.\-()]/g;

/** Retire espaces et ponctuation, sans toucher au reste. */
export function stripSeparators(value: string): string {
  return value.replace(SEPARATORS, "");
}

/**
 * Forme canonique E.164 : `+22901XXXXXXXX`.
 * C'est sous cette forme que les numéros sont stockés, pour que deux saisies
 * du même numéro ne donnent pas deux valeurs différentes en base.
 */
export function normaliseBeninPhone(value: string): string {
  const digits = stripSeparators(value.trim());

  if (digits.startsWith("+229")) return digits;
  if (digits.startsWith("00229")) return `+229${digits.slice(5)}`;
  if (digits.startsWith("229") && digits.length === 13) return `+${digits}`;

  return `+229${digits}`;
}

/** 10 chiffres commençant par 01, précédés ou non de l'indicatif. */
export function isValidBeninPhone(value: string): boolean {
  return /^\+22901\d{8}$/.test(normaliseBeninPhone(value));
}

/** Affichage lisible : `+229 01 97 00 00 01`. */
export function formatBeninPhone(value: string): string {
  const canonical = normaliseBeninPhone(value);
  if (!isValidBeninPhone(canonical)) return value;

  const national = canonical.slice(4); // 01XXXXXXXX
  const groups = [
    national.slice(0, 2),
    national.slice(2, 4),
    national.slice(4, 6),
    national.slice(6, 8),
    national.slice(8, 10),
  ];

  return `+229 ${groups.join(" ")}`;
}

export const PHONE_PLACEHOLDER = "+229 01 97 00 00 01";
export const PHONE_ERROR = `Numéro béninois invalide. Exemple : ${PHONE_PLACEHOLDER}`;
