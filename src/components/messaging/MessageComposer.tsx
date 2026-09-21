"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Send } from "lucide-react";

import { sendMessage, type MessageState } from "@/app/(account)/compte/messages/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { containsContact } from "@/lib/messaging/mask";

/**
 * Zone de saisie d'un message.
 *
 * **L'avertissement se donne pendant la frappe, jamais après l'envoi.**
 * Découvrir que son numéro n'est pas passé une fois le message parti se lit
 * comme une panne ; le dire avant, comme une règle — et cela laisse le choix de
 * reformuler.
 *
 * ⚠️ Ce contrôle n'est **pas** la protection : le masquage vit en base, dans
 * `read_conversation`, et un appel direct à l'API ne peut pas le contourner.
 * Ici, c'est de la courtoisie. Ne jamais l'y confondre.
 */

interface Props {
  conversationId: string;
  /** Vrai une fois l'acompte encaissé : plus rien n'est masqué. */
  unmasked: boolean;
}

export function MessageComposer({ conversationId, unmasked }: Props) {
  const [state, action, pending] = React.useActionState<MessageState, FormData>(sendMessage, {});
  const [draft, setDraft] = React.useState("");
  const [dernierEnvoi, setDernierEnvoi] = React.useState(false);

  // Vider après un envoi réussi, et seulement alors : perdre son texte sur une
  // erreur réseau serait la pire façon de traiter un message long.
  //
  // Ajusté **pendant le rendu** et non dans un effet — c'est le motif que React
  // recommande pour un état dérivé d'une propriété, et le seul que la règle
  // `react-hooks/set-state-in-effect` accepte. Un effet provoquerait de surcroît
  // un second rendu visible.
  if (Boolean(state.ok) !== dernierEnvoi) {
    setDernierEnvoi(Boolean(state.ok));
    if (state.ok) setDraft("");
  }

  const prevenir = !unmasked && containsContact(draft);

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="conversationId" value={conversationId} />

      <Textarea
        name="body"
        rows={3}
        maxLength={4000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Écrivez votre message…"
        aria-label="Votre message"
      />

      {prevenir ? (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-900"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Les numéros et adresses sont masqués tant que la réservation n&apos;est pas réglée.
            Vos coordonnées seront échangées automatiquement dès le premier paiement.
          </span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button type="submit" size="sm" disabled={pending || draft.trim().length === 0}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Envoyer
        </Button>

        {state.message ? (
          <span role="alert" className="text-xs text-slate-700">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
