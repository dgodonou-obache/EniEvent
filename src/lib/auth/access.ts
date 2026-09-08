/**
 * Décision d'accès à un espace.
 *
 * Volontairement pure : aucune requête, aucun import serveur. Toute la
 * politique d'accès tient dans `decideAccess`, ce qui la rend testable
 * exhaustivement — y compris les combinaisons qu'on n'a pas envie de reproduire
 * à la main (partenaire suspendu, compte appartenant aux deux mondes, membre
 * révoqué…). `session.ts` ne fait que lui fournir les faits.
 *
 * Cette décision double la RLS, elle ne la remplace pas : la base reste seule
 * garante de ce qu'un utilisateur peut lire ou écrire. Ici on décide seulement
 * quelle interface lui montrer.
 */

export type Space = "account" | "partner" | "company" | "admin";

export type AccountType = "particulier" | "entreprise" | "partenaire" | "admin";

export type OrgType = "company" | "partner";

export type OrgStatus = "pending" | "active" | "suspended";

export type MemberStatus = "invited" | "active" | "revoked";

export interface Membership {
  orgId: string;
  orgName: string;
  orgType: OrgType;
  orgStatus: OrgStatus;
  role: string;
  memberStatus: MemberStatus;
}

export type DenialReason =
  | "no-organization"
  | "membership-inactive"
  | "org-pending"
  | "org-suspended"
  | "not-admin";

export type AccessDecision =
  | { granted: true; org: Membership | null; available: Membership[] }
  | { granted: false; reason: DenialReason };

interface AccessInput {
  space: Space;
  accountType: AccountType;
  memberships: readonly Membership[];
}

export function decideAccess({ space, accountType, memberships }: AccessInput): AccessDecision {
  if (space === "account") {
    // Tout compte authentifié a son espace personnel, y compris un partenaire
    // qui réserve pour son propre mariage.
    return { granted: true, org: null, available: [] };
  }

  if (space === "admin") {
    return accountType === "admin"
      ? { granted: true, org: null, available: [] }
      : { granted: false, reason: "not-admin" };
  }

  const wanted: OrgType = space === "partner" ? "partner" : "company";
  const candidates = memberships.filter((m) => m.orgType === wanted);

  if (candidates.length === 0) {
    return { granted: false, reason: "no-organization" };
  }

  const active = candidates.filter((m) => m.memberStatus === "active");
  if (active.length === 0) {
    // Invitation jamais acceptée, ou accès retiré par un administrateur.
    return { granted: false, reason: "membership-inactive" };
  }

  const usable = active.filter((m) => m.orgStatus === "active");
  if (usable.length === 0) {
    // On distingue les deux cas : « en cours de vérification » appelle de la
    // patience, « suspendu » appelle un contact avec le support.
    const suspended = active.some((m) => m.orgStatus === "suspended");
    return { granted: false, reason: suspended ? "org-suspended" : "org-pending" };
  }

  // Un compte peut appartenir à plusieurs organisations du même type (une agence
  // qui gère deux marques). On ouvre la première ; le sélecteur d'organisation
  // viendra s'appuyer sur `available`.
  return { granted: true, org: usable[0], available: usable };
}

/** Message destiné à l'utilisateur. Pas de jargon, et une action possible. */
export function denialMessage(reason: DenialReason, space: Space): { title: string; body: string } {
  switch (reason) {
    case "not-admin":
      return {
        title: "Cet espace est réservé à l'équipe ÉniEvent",
        body: "Votre compte n'a pas les droits d'administration. Si vous pensez qu'il s'agit d'une erreur, contactez votre responsable.",
      };
    case "no-organization":
      return space === "partner"
        ? {
            title: "Vous n'êtes rattaché à aucun compte prestataire",
            body: "Pour proposer vos services sur ÉniEvent, créez votre compte partenaire. Si votre entreprise est déjà inscrite, demandez à son responsable de vous inviter.",
          }
        : {
            title: "Vous n'êtes rattaché à aucune entreprise",
            body: "L'espace entreprise est réservé aux comptes professionnels. Demandez à votre administrateur de vous inviter, ou créez le compte de votre société.",
          };
    case "membership-inactive":
      return {
        title: "Votre accès a été retiré",
        body: "Vous ne faites plus partie de cette équipe, ou votre invitation n'a pas encore été acceptée. Rapprochez-vous du responsable du compte.",
      };
    case "org-pending":
      return {
        title: "Votre compte est en cours de vérification",
        body: "Nos équipes examinent votre dossier. Vous recevrez un e-mail dès qu'il sera validé, généralement sous 48 heures ouvrées.",
      };
    case "org-suspended":
      return {
        title: "Ce compte est suspendu",
        body: "L'accès a été suspendu. Contactez le support ÉniEvent pour connaître la marche à suivre.",
      };
  }
}
