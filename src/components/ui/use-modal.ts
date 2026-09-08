"use client";

import * as React from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Comportement commun aux surfaces modales (Dialog, Sheet).
 *
 * Trois choses qu'une modale doit faire et que la v1 ne faisait pas :
 * fermer sur Échap, empêcher la page de défiler derrière, et garder le focus
 * à l'intérieur puis le rendre à l'élément déclencheur à la fermeture.
 *
 * Retourne la ref à poser sur le panneau.
 */
export function useModal(open: boolean, onClose: () => void) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Garde la callback à jour sans réabonner les écouteurs à chaque rendu.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Bloque le défilement de l'arrière-plan.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Donne le focus au premier élément interactif du panneau.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Referme le cycle de tabulation sur lui-même.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  return panelRef;
}
