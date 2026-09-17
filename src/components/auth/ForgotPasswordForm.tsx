"use client";

import * as React from "react";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";

/**
 * Demande de réinitialisation.
 *
 * **La réponse ne dit jamais si l'adresse existe.** Un message différent pour
 * un compte inconnu transformerait ce formulaire en annuaire : on saurait, en
 * essayant des adresses, lesquelles sont inscrites. Supabase se tait déjà de
 * son côté ; on se tait aussi du nôtre, y compris en cas d'erreur technique.
 *
 * Le lien reçu passe par `/auth/callback`, qui échange le code contre une
 * session, puis dépose sur `/nouveau-mot-de-passe`.
 */
export function ForgotPasswordForm({ retour }: { retour: string }) {
  const [envoye, setEnvoye] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?suivant=${encodeURIComponent(
        `/nouveau-mot-de-passe?retour=${encodeURIComponent(retour)}`,
      )}`,
    });

    // On affiche la même confirmation quoi qu'il arrive.
    setEnvoye(email);
    setIsPending(false);
  }

  if (envoye) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
          <MailCheck className="h-6 w-6 text-teal-600" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Vérifiez votre boîte mail</h2>
        <p className="mt-2 text-sm text-slate-500">
          Si un compte existe pour <span className="font-medium text-slate-900">{envoye}</span>,
          un lien de réinitialisation vient d&apos;y être envoyé. Il est valable une heure.
        </p>
        <p className="mt-4 text-xs text-slate-400">
          Rien reçu au bout de quelques minutes ? Regardez vos indésirables, puis réessayez.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="vous@exemple.com" />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Recevoir un lien
      </Button>
    </form>
  );
}
