"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

import { useModal } from "@/components/ui/use-modal";
import type { Photo } from "@/lib/media";

/**
 * Galerie d'une annonce.
 *
 * Les photos sont ce que le client regarde avant le prix, et une vignette de
 * 112 px ne montre rien : il doit pouvoir agrandir. **Un seul geste suffit** —
 * cliquer n'importe quelle image ouvre la visionneuse à cette photo-là, plutôt
 * que de la sélectionner d'abord puis de l'agrandir ensuite.
 *
 * `useModal` apporte déjà l'essentiel d'une modale : fermeture sur Échap,
 * blocage du défilement derrière, piège à focus et restitution du focus au
 * déclencheur. Ne restent ici que la navigation entre photos et le glissement
 * tactile — sur un marché où l'on consulte surtout au téléphone, obliger à
 * viser une flèche de 40 px serait un mauvais service.
 */

export function ListingGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [openAt, setOpenAt] = React.useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="mb-8 overflow-hidden rounded-2xl bg-slate-100">
        <div className="flex aspect-[16/9] items-center justify-center text-slate-400">
          Photos à venir
        </div>
      </div>
    );
  }

  const [cover, ...rest] = photos;

  return (
    <>
      <div className="mb-8 overflow-hidden rounded-2xl bg-slate-100">
        <button
          type="button"
          onClick={() => setOpenAt(0)}
          className="group relative block w-full"
          aria-label={`Agrandir les photos de ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.url}
            alt={cover.alt}
            className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />

          <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-all duration-200 group-hover:bg-slate-900/85">
            <Expand className="h-3.5 w-3.5" aria-hidden />
            {photos.length > 1 ? `${photos.length} photos` : "Agrandir"}
          </span>
        </button>

        {rest.length > 0 ? (
          <ul className="no-scrollbar flex gap-2 overflow-x-auto p-2">
            {rest.map((photo, index) => (
              <li key={photo.url}>
                <button
                  type="button"
                  // `index + 1` : la couverture occupe la place 0.
                  onClick={() => setOpenAt(index + 1)}
                  className="block overflow-hidden rounded-lg transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                  aria-label={`Agrandir la photo ${index + 2} sur ${photos.length}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    loading="lazy"
                    className="h-20 w-28 shrink-0 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {openAt !== null ? (
        <Lightbox
          photos={photos}
          startAt={openAt}
          title={title}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  photos,
  startAt,
  title,
  onClose,
}: {
  photos: Photo[];
  startAt: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = React.useState(startAt);
  const panelRef = useModal(true, onClose);
  const touchStart = React.useRef<number | null>(null);

  const go = React.useCallback(
    (step: number) => {
      // Cyclique : arrivé au bout, on revient au début plutôt que de bloquer
      // sur une flèche inerte.
      setIndex((current) => (current + step + photos.length) % photos.length);
    },
    [photos.length],
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [go]);

  // Précharge les voisines : sur une connexion mobile, attendre le
  // téléchargement après chaque flèche rend la galerie pénible.
  React.useEffect(() => {
    for (const step of [1, -1]) {
      const neighbour = photos[(index + step + photos.length) % photos.length];
      if (neighbour) new window.Image().src = neighbour.url;
    }
  }, [index, photos]);

  const current = photos[index];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div aria-hidden onClick={onClose} className="absolute inset-0 animate-fade-in bg-slate-950/90" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Photos de ${title}, ${index + 1} sur ${photos.length}`}
        className="relative flex h-full w-full flex-col"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const delta = event.changedTouches[0].clientX - touchStart.current;
          // 50 px : en deçà, c'est une pression, pas un glissement.
          if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
          touchStart.current = null;
        }}
      >
        <div className="flex shrink-0 items-center justify-between p-4 text-white">
          <p className="text-sm font-medium tabular-nums">
            {index + 1} / {photos.length}
          </p>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les photos"
            className="rounded-full bg-white/10 p-2 transition-all duration-200 hover:bg-white/20 active:scale-[0.97]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt}
            className="max-h-full max-w-full rounded-xl object-contain"
          />

          {photos.length > 1 ? (
            <>
              <Arrow side="left" onClick={() => go(-1)} />
              <Arrow side="right" onClick={() => go(1)} />
            </>
          ) : null}
        </div>

        {photos.length > 1 ? (
          <ul className="no-scrollbar flex shrink-0 justify-start gap-2 overflow-x-auto p-3 sm:justify-center">
            {photos.map((photo, position) => (
              <li key={photo.url}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-label={`Photo ${position + 1}`}
                  aria-current={position === index ? "true" : undefined}
                  className={`block overflow-hidden rounded-lg transition-all duration-200 ${
                    position === index
                      ? "ring-2 ring-orange-400"
                      : "opacity-50 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    className="h-14 w-20 shrink-0 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Photo précédente" : "Photo suivante"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-all duration-200 hover:bg-white/25 active:scale-[0.97] ${
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}
