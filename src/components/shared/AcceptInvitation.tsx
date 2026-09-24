"use client";

import * as React from "react";
import { Loader2, UserCheck } from "lucide-react";

import { acceptInvitation, type AcceptState } from "@/app/invitation/actions";
import { Button } from "@/components/ui/button";

/**
 * Le geste d'entrée dans l'équipe.
 *
 * **La redirection se fait ici, pas dans l'action.** Un `redirect()` côté
 * serveur emmènerait l'utilisateur sans qu'il ait vu ce qui s'est passé ; et
 * surtout, l'espace d'arrivée dépend du type d'organisation rejointe, que
 * seule la base connaît au moment de l'acceptation.
 *
 * ⚠️ **Les refus de la base sont affichés tels quels.** « Cette invitation a
 * été envoyée à x@y.bj » dit exactement quoi faire ; le remplacer par « accès
 * refusé » ferait perdre la seule information utile.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const [state, action, pending] = React.useActionState<AcceptState, FormData>(
    acceptInvitation,
    {},
  );

  React.useEffect(() => {
    if (state.destination) window.location.assign(state.destination);
  }, [state.destination]);

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="token" value={token} />

      <Button type="submit" disabled={pending || Boolean(state.destination)} className="w-full">
        {pending || state.destination ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {state.destination ? "Ouverture de votre espace…" : "Un instant…"}
          </>
        ) : (
          <>
            <UserCheck className="mr-2 h-4 w-4" aria-hidden />
            Rejoindre l&apos;équipe
          </>
        )}
      </Button>

      {state.error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
