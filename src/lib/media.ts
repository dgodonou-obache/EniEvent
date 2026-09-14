/**
 * Photos des annonces.
 *
 * **Le chemin porte l'autorisation.** Un objet est rangé sous
 * `{org_id}/{listing_id}/{fichier}` et les politiques de stockage n'autorisent
 * l'écriture que sous l'identifiant d'une organisation dont l'utilisateur est
 * membre. Fabriquer ce chemin ailleurs qu'ici ouvrirait la porte à un chemin
 * mal formé — donc à une photo déposée là où elle ne devrait pas.
 *
 * Le module est pur : ni Supabase, ni React. Il se teste sans rien monter.
 */

export const BUCKET = "annonces";

/** Formats acceptés. Le HEIC des iPhone n'est pas lisible par tous les navigateurs. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 5 Mo : au-delà, l'envoi échoue en pratique sur une connexion mobile béninoise. */
export const MAX_BYTES = 5 * 1024 * 1024;

/** Au-delà, la fiche devient illisible et le partenaire ne trie plus rien. */
export const MAX_PHOTOS = 12;

export type MediaCheck = { ok: true; extension: string } | { ok: false; message: string };

/**
 * Contrôle d'un fichier avant envoi. Les mêmes règles sont revérifiées côté
 * serveur : ce contrôle-ci sert à refuser tout de suite, pas à protéger.
 */
export function checkFile(file: { type: string; size: number }): MediaCheck {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      message: "Formats acceptés : JPEG, PNG ou WebP. Convertissez les photos HEIC de votre iPhone.",
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `Cette photo dépasse ${Math.round(MAX_BYTES / 1024 / 1024)} Mo. Réduisez-la avant de l'envoyer.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "Ce fichier est vide." };
  }

  return { ok: true, extension: EXTENSIONS[file.type] };
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Chemin de rangement d'une photo.
 *
 * Le nom du fichier d'origine n'est jamais repris : il peut contenir des
 * accents, des espaces, des barres obliques — et surtout, deux partenaires
 * téléversant « photo.jpg » se marcheraient dessus.
 */
export function buildPath(input: {
  orgId: string;
  listingId: string;
  extension: string;
  /** Injectable pour rendre les tests déterministes. */
  id?: string;
}): string {
  const id = input.id ?? crypto.randomUUID();
  return `${input.orgId}/${input.listingId}/${id}.${input.extension}`;
}

/** L'organisation propriétaire, telle que la lisent les politiques de stockage. */
export function orgOfPath(path: string): string | null {
  const [org] = path.split("/");
  return org && org.length > 0 ? org : null;
}

/**
 * URL publique d'un objet du seau.
 *
 * Reconstruite à la lecture plutôt que stockée : une URL complète en base
 * figerait le domaine du projet du jour, et une restauration sur un autre
 * projet Supabase rendrait toutes les photos introuvables.
 */
export function publicUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export interface Photo {
  url: string;
  /** Jamais vide : un `alt` absent laisserait l'image muette pour un lecteur d'écran. */
  alt: string;
}

/**
 * Photos d'une annonce, dans l'ordre où le client les verra.
 *
 * La couverture ouvre la série — c'est celle que le partenaire a désignée, et
 * celle qu'on a vue dans les résultats de recherche : la retrouver ailleurs
 * que devant donnerait l'impression d'avoir changé de fiche.
 *
 * Le repli sur `cover_url` seule couvre les annonces dont la couverture a été
 * posée sans passer par le registre — c'est le cas du jeu de démonstration.
 */
export function galleryPhotos(input: {
  supabaseUrl: string;
  coverUrl: string | null;
  media: readonly { storage_path: string; alt: string | null; position: number | null }[];
  /** Sert d'`alt` de repli : « Salle Étoile » vaut mieux qu'une image muette. */
  title: string;
}): Photo[] {
  const ordered = [...input.media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const photos: Photo[] = [];
  const seen = new Set<string>();

  for (const item of ordered) {
    const url = publicUrl(input.supabaseUrl, item.storage_path);
    if (seen.has(url)) continue;
    seen.add(url);
    photos.push({ url, alt: item.alt?.trim() || input.title });
  }

  if (!input.coverUrl) return photos;

  const coverIndex = photos.findIndex((photo) => photo.url === input.coverUrl);

  if (coverIndex === -1) {
    return [{ url: input.coverUrl, alt: input.title }, ...photos];
  }

  const [cover] = photos.splice(coverIndex, 1);
  return [cover, ...photos];
}
