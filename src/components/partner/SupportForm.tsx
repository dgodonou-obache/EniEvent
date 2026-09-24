"use client";

import * as React from "react";
import { Check, Loader2, Send } from "lucide-react";

import {
  sendSupportRequest,
  type SupportState,
} from "@/app/(partner)/pro/(dashboard)/support/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFieldErrors } from "@/components/ui/use-field-errors";

/**
 * Écrire au support.
 *
 * **La réponse arrive par courriel, et l'écran le dit.** Ce n'est pas une
 * messagerie : laisser croire qu'une réponse apparaîtra ici ferait revenir le
 * partenaire pour rien, puis conclure qu'on ne lui a pas répondu.
 *
 * Le champ d'adresse est pré-rempli mais modifiable : sur un compte partagé —
 * fréquent dans une petite structure — la personne qui écrit n'est pas
 * toujours celle qui relève la boîte.
 */

export function SupportForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = React.useActionState<SupportState, FormData>(
    sendSupportRequest,
    {},
  );

  // Encadre en rouge et emmène au premier champ fautif, dans l'ordre de
  // l'écran — le même mécanisme que partout ailleurs dans le dépôt.
  const formRef = useFieldErrors(state.fields);

  if (state.message) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
        <p className="flex items-start gap-2 text-sm font-semibold text-teal-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="subject">Sujet</Label>
          <Input
            id="subject"
            name="subject"
            required
            maxLength={150}
            placeholder="Ex. : je ne reçois pas les demandes de devis"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="body">Votre message</Label>
          <Textarea
            id="body"
            name="body"
            required
            rows={7}
            maxLength={4000}
            placeholder="Décrivez ce que vous faisiez, et ce qui s'est passé. Si un message d'erreur s'est affiché, recopiez-le : c'est souvent ce qui permet de trouver la cause du premier coup."
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="replyTo">Adresse de réponse</Label>
          <Input
            id="replyTo"
            name="replyTo"
            type="email"
            required
            defaultValue={defaultEmail}
            className="mt-1.5"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            C&apos;est là que nous répondrons. Modifiez-la si la boîte relevée est différente.
          </p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-5 w-full sm:w-auto">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Envoi…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" aria-hidden />
            Envoyer au support
          </>
        )}
      </Button>
    </form>
  );
}
