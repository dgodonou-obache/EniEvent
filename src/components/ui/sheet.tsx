"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useModal } from "./use-modal";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side?: "right" | "left";
  children: React.ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  side = "right",
  children,
  className,
}: SheetProps) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const panelRef = useModal(open, close);
  const titleId = React.useId();

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-50 flex", side === "right" ? "justify-end" : "justify-start")}
    >
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
        className={cn(
          "relative flex h-full w-full max-w-md flex-col border-slate-100 bg-white",
          side === "right" ? "border-l" : "border-r",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto bg-slate-50/50 p-6">{children}</div>
      </div>
    </div>
  );
}
