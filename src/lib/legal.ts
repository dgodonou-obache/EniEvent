/**
 * Identité légale et sous-traitants d'ÉniEvent.
 *
 * **Un seul endroit à remplir.** Les mentions légales, les conditions
 * générales et la politique de confidentialité puisent toutes ici : recopier
 * un numéro RCCM dans trois pages garantit qu'il en restera un faux le jour
 * où il changera.
 *
 * ⚠️ Les valeurs marquées `null` **ne sont pas encore renseignées**. Les pages
 * les affichent alors en clair comme « à compléter » plutôt que d'inventer :
 * une mention légale fausse est pire qu'une mention légale absente, et c'est
 * exactement ce que vérifie un prestataire de paiement à l'ouverture d'un
 * compte marchand.
 */

export interface LegalEntity {
  /** Dénomination sociale exacte, telle qu'au RCCM. */
  readonly legalName: string;
  /** SARL, SAS, établissement… */
  readonly legalForm: string | null;
  /** Registre du commerce et du crédit mobilier. */
  readonly rccm: string | null;
  /** Identifiant fiscal unique. */
  readonly ifu: string | null;
  /**
   * Voie et numéro, **sans** la ville ni le pays, qui ont leurs propres champs.
   *
   * ⚠️ Rester `null` est légitime : un établissement béninois se déclare
   * couramment à la commune, sans libellé de voie. Le siège social s'affiche
   * alors « Cotonou, Bénin », ce qui est exact et complet — ce n'est pas une
   * information manquante, et `entityIsComplete` ne l'exige donc pas.
   */
  readonly address: string | null;
  readonly city: string;
  readonly country: string;
  readonly email: string;
  readonly phone: string | null;
  /** Personne responsable du contenu publié. */
  readonly publicationDirector: string | null;
}

/**
 * ⚠️ **Pas de capital social.** Un établissement n'en a pas : ce n'est pas une
 * société, son patrimoine est celui de son exploitant. Le champ a été retiré
 * plutôt que laissé vide — une ligne « Capital social : à compléter » aurait
 * promis une information qui n'existera jamais, et l'inscrire à 0 F aurait été
 * un faux.
 */
export const ENTITY: LegalEntity = {
  legalName: "ÉniEvent",
  legalForm: "Établissement",
  rccm: "RB/COT/21 A 70480",
  ifu: "0202112931007",
  address: null,
  city: "Cotonou",
  country: "Bénin",
  email: "contact@enievent.com",
  phone: null,
  publicationDirector: null,
};

/** Le siège social tel qu'il se publie, voie comprise quand il y en a une. */
export function registeredOffice(entity: LegalEntity = ENTITY): string {
  return [entity.address, entity.city, entity.country].filter(Boolean).join(", ");
}

/** Rend la valeur, ou une mention visible quand elle manque. */
export function orTodo(value: string | null): string {
  return value ?? "à compléter";
}

/**
 * Vrai quand l'identité légale est complète et publiable telle quelle.
 *
 * `address` n'en fait pas partie : voir le champ, son absence est un cas
 * normal. `city` et `country` ne sont pas nullables, le siège est donc
 * toujours énonçable.
 */
export function entityIsComplete(entity: LegalEntity = ENTITY): boolean {
  return [
    entity.legalForm,
    entity.rccm,
    entity.ifu,
    entity.phone,
    entity.publicationDirector,
  ].every((v) => v !== null && v.trim() !== "");
}

export interface Processor {
  readonly name: string;
  readonly role: string;
  readonly location: string;
  readonly site: string;
}

/**
 * Sous-traitants réellement employés, et rien d'autre.
 *
 * Vérifiés contre la configuration du projet, pas contre un souvenir : la base
 * est en `eu-west-3` (Paris) et l'application s'exécute en `cdg1` (Paris).
 * Annoncer un hébergement européen qui n'en serait pas un est le genre
 * d'inexactitude qui se retourne contre son auteur.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    role: "Base de données et comptes utilisateurs",
    location: "Paris, France (eu-west-3)",
    site: "https://supabase.com/privacy",
  },
  {
    name: "Vercel",
    role: "Hébergement et exécution du site",
    location: "Paris, France (cdg1)",
    site: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "FedaPay",
    role: "Encaissement des paiements (Mobile Money, carte)",
    location: "Cotonou, Bénin",
    site: "https://fedapay.com",
  },
  {
    name: "Resend",
    role: "Envoi des courriels",
    location: "États-Unis",
    site: "https://resend.com/legal/privacy-policy",
  },
  {
    name: "OVHcloud",
    role: "Nom de domaine et messagerie",
    location: "France",
    site: "https://www.ovhcloud.com",
  },
];

/** Date de dernière révision des textes, affichée sur chaque page. */
export const LAST_UPDATED = "5 octobre 2026";
