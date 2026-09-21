"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";

import {
  openConversation,
  openConversationForRequest,
  type OpenState,
} from "@/app/(account)/compte/messages/actions";
import { Button } from "@/components/ui/button";

/**
 * « Poser une question », des deux côtés du marché.
 *
 * Deux actions distinctes derrière un même bouton, et c'est voulu :
 *
 * - **côté client**, on désigne un prestataire ;
 * - **côté prestataire**, on désigne une **demande**, jamais un client. La base
 *   en déduit l'interlocuteur. C'est ce qui préserve l'anonymat de l'appel
 *   d'offres : rien de ce que le partenaire envoie ne nomme qui que ce soit, et
 *   il ne pourrait pas écrire à un client qu'il aurait choisi.
 *
 * La redirection se fait dans un effet, jamais pendant le rendu : une
 * navigation est une conséquence, pas un calcul.
 */

interface Props {
  /** Côté client : l'organisation visée. */
  orgId?: string;
  listingId?: string;
  /** Côté prestataire : la demande, et sa propre organisation. */
  requestId?: string;
  partnerOrgId?: string;
  /** Racine de l'espace appelant — les espaces sont étanches. */
  base: string;
  label?: string;
  variant?: "default" | "outline";
  className?: string;
}

export function AskQuestionButton({
  orgId,
  listingId,
  requestId,
  partnerOrgId,
  base,
  label = "Poser une question",
  variant = "outline",
  className,
}: Props) {
  const router = useRouter();
  const cotePrestataire = Boolean(partnerOrgId);

  const [state, action, pending] = React.useActionState<OpenState, FormData>(
    cotePrestataire ? openConversationForRequest : openConversation,
    {},
  );

  React.useEffect(() => {
    if (state.ok && state.conversationId) {
      router.push(`${base}/${state.conversationId}`);
    }
  }, [state.ok, state.conversationId, base, router]);

  return (
    <form action={action} className={className}>
      {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      {partnerOrgId ? <input type="hidden" name="orgId" value={partnerOrgId} /> : null}

      <Button type="submit" variant={variant} size="sm" disabled={pending} className="w-full">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <MessageSquare className="h-4 w-4" aria-hidden />
        )}
        {label}
      </Button>

      {state.message ? (
        <p role="alert" className="mt-2 text-xs text-slate-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
