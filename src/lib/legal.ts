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
  /** SARL, SAS, entreprise individuelle… */
  readonly legalForm: string | null;
  readonly capital: string | null;
  /** Registre du commerce et du crédit mobilier. */
  readonly rccm: string | null;
  /** Identifiant fiscal unique. */
  readonly ifu: string | null;
  readonly address: string | null;
  readonly city: string;
  readonly country: string;
  readonly email: string;
  readonly phone: string | null;
  /** Personne responsable du contenu publié. */
  readonly publicationDirector: string | null;
}

export const ENTITY: LegalEntity = {
  legalName: "ÉniEvent",
  legalForm: null,
  capital: null,
  rccm: null,
  ifu: null,
  address: null,
  city: "Cotonou",
  country: "Bénin",
  email: "contact@enievent.com",
  phone: null,
  publicationDirector: null,
};

/** Rend la valeur, ou une mention visible quand elle manque. */
export function orTodo(value: string | null): string {
  return value ?? "à compléter";
}

/** Vrai quand l'identité légale est complète et publiable telle quelle. */
export function entityIsComplete(entity: LegalEntity = ENTITY): boolean {
  return [
    entity.legalForm,
    entity.rccm,
    entity.ifu,
    entity.address,
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
export const LAST_UPDATED = "22 septembre 2026";
