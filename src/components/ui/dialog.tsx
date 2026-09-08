"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useModal } from "./use-modal";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titre accessible. Obligatoire : c'est ce qu'annoncent les lecteurs d'écran. */
  title: string;
  description?: string;
  /** Masque visuellement le titre sans le retirer de l'arbre d'accessibilité. */
  hideTitle?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  className,
}: DialogProps) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const panelRef = useModal(open, close);
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden
        onClick={close}
        className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "relative w-full max-w-md animate-slide-up rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/50",
          className,
        )}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          className="absolute right-4 top-4 rounded-full p-1 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <h2
          id={titleId}
          className={cn(
            "pr-8 text-lg font-bold text-slate-900",
            hideTitle && "sr-only",
          )}
        >
          {title}
        </h2>

        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-slate-500">
            {description}
          </p>
        ) : null}

        <div className={cn(!hideTitle && "mt-4")}>{children}</div>
      </div>
    </div>
  );
}
