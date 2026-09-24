import type { Database } from "@/types/database";

/**
 * Pièces justificatives d'un partenaire.
 *
 * ⚠️ **Le seau est privé** (migration 0041), contrairement à celui des photos.
 * On y dépose des pièces d'identité et des coordonnées bancaires : il n'existe
 * donc aucun équivalent de `publicUrl()` ici, et il ne doit pas en exister.
 * La lecture passe par une URL signée émise côté serveur, à durée courte —
 * voir `signedDocumentUrl` dans les actions de `/pro/documents`.
 */

export const KYC_BUCKET = "justificatifs";

/** Durée d'une URL signée. Assez pour ouvrir un document, pas pour le partager. */
export const SIGNED_URL_SECONDS = 60;

export type KycDocumentType = Database["public"]["Enums"]["kyc_document_type"];
export type KycStatus = Database["public"]["Enums"]["kyc_status"];

/**
 * Formats acceptés.
 *
 * Le PDF s'ajoute aux images : un extrait RCCM arrive presque toujours ainsi.
 * Le HEIC reste exclu, comme pour les photos d'annonce — tous les navigateurs
 * ne le lisent pas, et un document illisible par l'administration ne sert à
 * rien à celui qui l'a déposé.
 */
export const KYC_ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 8 Mo. Un scan de carte tient largement dedans ; au-delà, c'est une photo non recadrée. */
export const KYC_MAX_BYTES = 8 * 1024 * 1024;

export interface FileCheck {
  ok: boolean;
  extension?: string;
  reason?: string;
}

export function checkKycFile(file: File): FileCheck {
  const extension = KYC_ACCEPTED[file.type];

  if (!extension) {
    // Le cas concret, et il faut le nommer : une photo prise avec un iPhone
    // arrive en HEIC, que la plupart des navigateurs ne savent pas afficher.
    return {
      ok: false,
      reason:
        file.type === "image/heic" || file.type === "image/heif"
          ? "Ce format (HEIC) n'est pas lisible par tous les navigateurs. Convertissez la photo en JPEG."
          : "Formats acceptés : JPEG, PNG, WebP ou PDF.",
    };
  }

  if (file.size > KYC_MAX_BYTES) {
    return {
      ok: false,
      reason: `Ce fichier fait ${Math.round(file.size / 1024 / 1024)} Mo. La limite est de 8 Mo.`,
    };
  }

  return { ok: true, extension };
}

/**
 * Le chemin d'un justificatif : `{org_id}/{type}-{horodatage}.{ext}`.
 *
 * ⚠️ **Le premier dossier porte tout le cloisonnement** : les politiques de
 * stockage comparent `(storage.foldername(name))[1]` aux organisations de
 * l'utilisateur. Un chemin qui ne commence pas par l'identifiant de
 * l'organisation est refusé.
 *
 * L'horodatage évite d'écraser la pièce précédente : remplacer un RIB ne doit
 * pas effacer celui sur lequel un versement a déjà été fait.
 */
export function buildKycPath(orgId: string, type: KycDocumentType, extension: string): string {
  return `${orgId}/${type}-${Date.now()}.${extension}`;
}

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  pending: "En cours de vérification",
  approved: "Validée",
  rejected: "À refaire",
};
