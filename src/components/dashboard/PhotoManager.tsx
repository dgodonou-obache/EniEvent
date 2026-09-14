"use client";

import * as React from "react";
import {
  ImagePlus,
  Info,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";

import {
  registerPhoto,
  removePhoto,
  setCoverPhoto,
  type ActionState,
} from "@/app/(partner)/pro/(dashboard)/annonces/actions";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import {
  ACCEPTED_TYPES,
  BUCKET,
  MAX_PHOTOS,
  buildPath,
  checkFile,
  publicUrl,
} from "@/lib/media";
import { createClient } from "@/utils/supabase/client";

/**
 * Photos d'une annonce.
 *
 * Le fichier part **directement du navigateur vers le stockage**, sans passer
 * par le serveur Next : sur une connexion mobile béninoise, faire transiter
 * 5 Mo deux fois doublerait l'attente pour rien. Les politiques de stockage
 * vérifient que le chemin commence par l'organisation de l'utilisateur — c'est
 * là que se joue le cloisonnement, pas ici.
 *
 * L'action serveur qui suit ne fait que tenir le registre.
 */

interface Photo {
  id: string;
  storage_path: string;
  alt: string | null;
  position: number;
}

export function PhotoManager({
  listingId,
  orgId,
  photos,
  coverUrl,
}: {
  listingId: string;
  orgId: string;
  photos: Photo[];
  coverUrl: string | null;
}) {
  const env = publicEnv();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  const [registerState, registerAction] = React.useActionState<ActionState, FormData>(
    registerPhoto,
    {},
  );
  const [removeState, removeAction] = React.useActionState<ActionState, FormData>(
    removePhoto,
    {},
  );
  const [coverState, coverAction] = React.useActionState<ActionState, FormData>(
    setCoverPhoto,
    {},
  );

  const registerRef = React.useRef<HTMLFormElement>(null);
  const pathRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError(null);

    const remaining = MAX_PHOTOS - photos.length;
    if (files.length > remaining) {
      setError(
        remaining <= 0
          ? `Cette annonce a déjà ${MAX_PHOTOS} photos.`
          : `Il ne reste que ${remaining} emplacement${remaining > 1 ? "s" : ""}.`,
      );
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length });

    const supabase = createClient();

    try {
      for (const [index, file] of [...files].entries()) {
        const check = checkFile(file);
        if (!check.ok) {
          setError(`${file.name} : ${check.message}`);
          break;
        }

        const path = buildPath({ orgId, listingId, extension: check.extension });

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          // Une heure, et non un an. Le nom de fichier est unique, donc un cache
          // long serait sans risque pour un *remplacement* — mais pas pour une
          // *suppression* : le CDN continuerait de servir pendant toute la durée
          // une photo que le partenaire a retirée, ou que la modération a exigé
          // d'enlever.
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          // Le refus le plus probable : la politique de chemin. Le dire en
          // clair plutôt que de relayer « new row violates… ».
          setError(
            uploadError.message.toLowerCase().includes("policy")
              ? "Envoi refusé : cette annonce n'appartient pas à votre organisation."
              : `Envoi impossible : ${uploadError.message}`,
          );
          break;
        }

        // Le registre est tenu côté serveur, une photo à la fois : c'est lui
        // qui décide de la position et de la couverture.
        if (pathRef.current && registerRef.current) {
          pathRef.current.value = path;
          registerRef.current.requestSubmit();
        }

        setProgress({ done: index + 1, total: files.length });
      }
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const message = error ?? registerState.message ?? removeState.message ?? coverState.message;
  const isError = Boolean(error) || message?.includes("impossible") || message?.includes("introuvable");

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Photos</h2>
          <p className="mt-1 text-sm text-slate-500">
            C&apos;est ce que le client regarde en premier, avant le prix. La photo de
            couverture est celle qui apparaît dans les résultats de recherche.
          </p>
        </div>
        <span className="shrink-0 text-sm text-slate-400">
          {photos.length} / {MAX_PHOTOS}
        </span>
      </div>

      {/* Formulaire caché : le téléversement se fait en JavaScript, mais
          l'enregistrement passe par une Server Action comme le reste. */}
      <form action={registerAction} ref={registerRef} className="hidden">
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="path" ref={pathRef} />
      </form>

      {photos.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          Aucune photo. Une annonce sans photo est rarement contactée.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => {
            const url = publicUrl(env.supabaseUrl, photo.storage_path);
            const isCover = coverUrl === url;

            return (
              <li
                key={photo.id}
                className={`group relative overflow-hidden rounded-xl border ${
                  isCover ? "border-orange-300 ring-2 ring-orange-200" : "border-slate-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={photo.alt ?? ""}
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />

                {isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Couverture
                  </span>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-slate-900/70 to-transparent p-2">
                  {!isCover ? (
                    <form action={coverAction}>
                      <input type="hidden" name="listingId" value={listingId} />
                      <input type="hidden" name="mediaId" value={photo.id} />
                      <button
                        type="submit"
                        aria-label="Définir comme photo de couverture"
                        className="rounded-lg bg-white/90 p-1.5 text-slate-700 transition-all duration-200 hover:bg-white hover:text-orange-600 active:scale-[0.97]"
                      >
                        <Star className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <span />
                  )}

                  <form action={removeAction}>
                    <input type="hidden" name="listingId" value={listingId} />
                    <input type="hidden" name="mediaId" value={photo.id} />
                    <button
                      type="submit"
                      aria-label="Retirer cette photo"
                      className="rounded-lg bg-white/90 p-1.5 text-slate-700 transition-all duration-200 hover:bg-white hover:text-red-600 active:scale-[0.97]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || photos.length >= MAX_PHOTOS}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden />
          )}
          Ajouter des photos
        </Button>

        {progress ? (
          <p className="text-sm text-slate-500">
            {progress.done} sur {progress.total} envoyée{progress.total > 1 ? "s" : ""}…
          </p>
        ) : (
          <p className="text-xs text-slate-400">JPEG, PNG ou WebP · 5 Mo maximum par photo</p>
        )}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            isError ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-800"
          }`}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}
    </section>
  );
}
