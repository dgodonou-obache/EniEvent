"use client";

import * as React from "react";
import { Loader2, PenLine } from "lucide-react";

import { startQuote, type QuoteState } from "@/app/(partner)/pro/(dashboard)/devis/actions";
import { Button } from "@/components/ui/button";

/**
 * Ouvre un brouillon de devis sur un besoin, ou rouvre celui qui existe déjà.
 * L'action redirige vers l'éditeur : le partenaire ne repasse jamais par une
 * liste après avoir cliqué « Répondre ».
 */
export function RespondButton({ itemId, label }: { itemId: string; label: string }) {
  const [state, formAction, pending] = React.useActionState<QuoteState, FormData>(
    startQuote,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <PenLine className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </Button>

      {state.message ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
