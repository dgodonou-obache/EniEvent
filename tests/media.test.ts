import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  BUCKET,
  MAX_BYTES,
  MAX_PHOTOS,
  buildPath,
  checkFile,
  galleryPhotos,
  orgOfPath,
  publicUrl,
} from "@/lib/media";

/**
 * Le chemin d'une photo **porte l'autorisation** : les politiques de stockage
 * n'autorisent l'écriture que sous l'identifiant de l'organisation. Une erreur
 * de fabrication ici, et une photo se retrouve là où elle ne devrait pas — ou
 * n'est pas déposée du tout.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const LISTING = "22222222-2222-4222-8222-222222222222";

describe("contrôle du fichier", () => {
  it("accepte les formats lisibles par tous les navigateurs", () => {
    for (const type of ACCEPTED_TYPES) {
      expect(checkFile({ type, size: 500_000 }).ok, type).toBe(true);
    }
  });

  it("refuse le HEIC des iPhone en l'expliquant", () => {
    // Format par défaut sur iOS, illisible par une partie des navigateurs :
    // l'accepter produirait des annonces aux photos invisibles.
    const check = checkFile({ type: "image/heic", size: 500_000 });

    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toMatch(/HEIC/i);
  });

  it("refuse un fichier trop lourd en donnant la limite", () => {
    const check = checkFile({ type: "image/jpeg", size: MAX_BYTES + 1 });

    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.message).toContain("5 Mo");
  });

  it("accepte un fichier exactement à la limite", () => {
    expect(checkFile({ type: "image/jpeg", size: MAX_BYTES }).ok).toBe(true);
  });

  it("refuse un fichier vide", () => {
    expect(checkFile({ type: "image/png", size: 0 }).ok).toBe(false);
  });

  it("donne l'extension correspondant au type réel", () => {
    // L'extension vient du type MIME, jamais du nom d'origine : « photo.jpg »
    // peut très bien être un PNG.
    const check = checkFile({ type: "image/webp", size: 1000 });
    expect(check.ok && check.extension).toBe("webp");
  });
});

describe("chemin de rangement", () => {
  it("range sous l'organisation puis l'annonce", () => {
    const path = buildPath({ orgId: ORG, listingId: LISTING, extension: "jpg", id: "abc" });
    expect(path).toBe(`${ORG}/${LISTING}/abc.jpg`);
  });

  it("expose l'organisation là où la politique la lit", () => {
    const path = buildPath({ orgId: ORG, listingId: LISTING, extension: "jpg", id: "abc" });
    expect(orgOfPath(path)).toBe(ORG);
  });

  it("ne reprend jamais le nom du fichier d'origine", () => {
    // Deux partenaires envoyant « photo.jpg » se marcheraient dessus, et un nom
    // accentué ou contenant une barre oblique fausserait le dossier.
    const first = buildPath({ orgId: ORG, listingId: LISTING, extension: "jpg" });
    const second = buildPath({ orgId: ORG, listingId: LISTING, extension: "jpg" });

    expect(first).not.toBe(second);
    expect(first).toMatch(
      new RegExp(`^${ORG}/${LISTING}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it("ne trouve pas d'organisation dans un chemin vide", () => {
    expect(orgOfPath("")).toBeNull();
  });
});

describe("URL publique", () => {
  it("construit l'adresse du seau", () => {
    expect(publicUrl("https://projet.supabase.co", `${ORG}/${LISTING}/a.jpg`)).toBe(
      `https://projet.supabase.co/storage/v1/object/public/${BUCKET}/${ORG}/${LISTING}/a.jpg`,
    );
  });

  it("tolère une barre oblique finale dans l'URL du projet", () => {
    // `NEXT_PUBLIC_SUPABASE_URL` est saisi à la main : la barre finale arrive.
    expect(publicUrl("https://projet.supabase.co/", "a/b/c.jpg")).not.toContain("co//storage");
  });

});

describe("ordre de la galerie", () => {
  const SUPABASE = "https://projet.supabase.co";
  const TITLE = "Salle Étoile";

  function media(paths: string[]) {
    return paths.map((path, index) => ({
      storage_path: `${ORG}/${LISTING}/${path}`,
      alt: null,
      position: index,
    }));
  }

  function url(path: string) {
    return publicUrl(SUPABASE, `${ORG}/${LISTING}/${path}`);
  }

  it("place la couverture en tête", () => {
    // C'est la photo vue dans les résultats de recherche : la retrouver
    // ailleurs qu'en premier donnerait l'impression de changer de fiche.
    const photos = galleryPhotos({
      supabaseUrl: SUPABASE,
      coverUrl: url("c.jpg"),
      media: media(["a.jpg", "b.jpg", "c.jpg"]),
      title: TITLE,
    });

    expect(photos.map((photo) => photo.url)).toEqual([url("c.jpg"), url("a.jpg"), url("b.jpg")]);
  });

  it("ne duplique pas la couverture", () => {
    const photos = galleryPhotos({
      supabaseUrl: SUPABASE,
      coverUrl: url("a.jpg"),
      media: media(["a.jpg", "b.jpg"]),
      title: TITLE,
    });

    expect(photos).toHaveLength(2);
  });

  it("respecte l'ordre choisi par le partenaire", () => {
    const photos = galleryPhotos({
      supabaseUrl: SUPABASE,
      coverUrl: null,
      media: [
        { storage_path: `${ORG}/${LISTING}/tard.jpg`, alt: null, position: 5 },
        { storage_path: `${ORG}/${LISTING}/tot.jpg`, alt: null, position: 1 },
      ],
      title: TITLE,
    });

    expect(photos.map((photo) => photo.url)).toEqual([url("tot.jpg"), url("tard.jpg")]);
  });

  it("accepte une couverture absente du registre", () => {
    // Cas du jeu de démonstration : une couverture posée sans passer par le
    // registre des médias.
    const photos = galleryPhotos({
      supabaseUrl: SUPABASE,
      coverUrl: "https://exemple.test/photo.jpg",
      media: media(["a.jpg"]),
      title: TITLE,
    });

    expect(photos[0].url).toBe("https://exemple.test/photo.jpg");
    expect(photos).toHaveLength(2);
  });

  it("ne rend rien sans photo ni couverture", () => {
    expect(
      galleryPhotos({ supabaseUrl: SUPABASE, coverUrl: null, media: [], title: TITLE }),
    ).toEqual([]);
  });

  it("ne laisse jamais une image muette", () => {
    // Un `alt` vide rendrait la photo invisible pour un lecteur d'écran : le
    // titre de l'annonce vaut mieux que rien.
    const photos = galleryPhotos({
      supabaseUrl: SUPABASE,
      coverUrl: null,
      media: [
        { storage_path: `${ORG}/${LISTING}/a.jpg`, alt: "   ", position: 0 },
        { storage_path: `${ORG}/${LISTING}/b.jpg`, alt: "Vue du jardin", position: 1 },
      ],
      title: TITLE,
    });

    expect(photos[0].alt).toBe(TITLE);
    expect(photos[1].alt).toBe("Vue du jardin");
  });
});

describe("limites", () => {
  it("plafonne le nombre de photos par annonce", () => {
    // Au-delà, la fiche devient illisible et le partenaire ne trie plus rien.
    expect(MAX_PHOTOS).toBe(12);
  });
});
