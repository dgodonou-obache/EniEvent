/**
 * Rôles et pièces de l'espace partenaire, dits en clair.
 *
 * Le pendant de `COMPANY_ROLES` (`./company.ts`). Les deux familles de rôles
 * vivent dans la **même** énumération Postgres `org_role`, et une contrainte
 * `role_matches_org_type` empêche un rôle d'entreprise d'atterrir chez un
 * partenaire. Les séparer ici évite de proposer « Valideur » à un traiteur —
 * la base le refuserait, mais l'écran ne doit pas l'offrir.
 */

export const PARTNER_ROLES = [
  { value: "owner", label: "Propriétaire", hint: "Tous les droits, y compris les versements." },
  { value: "manager", label: "Gérant", hint: "Annonces, planning, devis et réservations." },
  { value: "staff", label: "Équipier", hint: "Consulte le planning et les réservations." },
  { value: "accountant", label: "Comptable", hint: "Revenus, versements et pièces justificatives." },
] as const;

export const PARTNER_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  PARTNER_ROLES.map((role) => [role.value, role.label]),
);

export const PARTNER_ROLE_HINTS: Record<string, string> = Object.fromEntries(
  PARTNER_ROLES.map((role) => [role.value, role.hint]),
);

/**
 * Les rôles qui peuvent déposer une pièce justificative.
 *
 * Aligné sur `kyc_documents_insert` (migration 0002) : `owner` et `accountant`
 * uniquement. Un gérant publie des annonces, il ne dépose pas le RCCM.
 */
export const KYC_ROLES: readonly string[] = ["owner", "accountant"];

/** Les pièces attendues d'un partenaire, dans l'ordre où on les demande. */
export const KYC_TYPES = [
  {
    value: "id_card",
    label: "Pièce d'identité du dirigeant",
    hint: "Carte d'identité, passeport ou CIP, recto-verso et lisible.",
  },
  {
    value: "rccm",
    label: "Registre du commerce (RCCM)",
    hint: "L'extrait au nom de la structure, pas une carte de visite.",
  },
  {
    value: "ifu",
    label: "Identifiant fiscal unique (IFU)",
    hint: "L'attestation délivrée par la DGI.",
  },
  {
    value: "bank_details",
    label: "Coordonnées de règlement",
    hint: "RIB, ou numéro Mobile Money au nom de la structure.",
  },
  {
    value: "insurance",
    label: "Assurance",
    hint: "Responsabilité civile professionnelle, si votre activité l'exige.",
  },
] as const;

export const KYC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  KYC_TYPES.map((t) => [t.value, t.label]),
);
