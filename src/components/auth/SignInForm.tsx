"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailWarning } from "lucide-react";

import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { describeSignIn } from "@/lib/auth/signup-outcome";
import { safeInternalPath } from "@/lib/validation/redirect";
import { createClient } from "@/utils/supabase/client";

interface SignInFormProps {
  /** Où aller après connexion si aucune destination n'a été mémorisée. */
  defaultRedirect: string;
  /** Destination mémorisée par le middleware (paramètre `suivant`). */
  redirectTo?: string;
}

export function SignInForm({ defaultRedirect, redirectTo }: SignInFormProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  // Une destination venue de l'URL ne doit jamais pouvoir sortir du site.
  // ⚠️ Le contrôle à la main qui se trouvait ici laissait passer `/\evil.com`,
  // que `router.push` aurait suivi hors du domaine — après une connexion
  // réussie, donc au moment où la personne fait le plus confiance à la page.
  const destination = safeInternalPath(redirectTo, defaultRedirect);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    const issue = describeSignIn({ error: signInError });

    if (issue.kind === "adresse-non-confirmee") {
      // ⚠️ Distinguer ce cas **ne coûte rien en énumération** : Supabase ne rend
      // `email_not_confirmed` que lorsque le mot de passe est correct. On ne
      // l'apprend donc qu'à qui le connaît déjà — contrairement à « adresse
      // inconnue », qu'on continue de taire.
      //
      // Sans cette distinction, un compte valide mais non confirmé s'entendait
      // répondre « mot de passe incorrect » : l'utilisateur en concluait qu'il
      // n'avait pas de compte, et abandonnait.
      setUnconfirmed(email);
      setIsPending(false);
      return;
    }

    if (issue.kind === "refuse") {
      // Message volontairement identique pour un e-mail inconnu et un mot de
      // passe faux : distinguer les deux révélerait quels comptes existent.
      setError("Adresse e-mail ou mot de passe incorrect.");
      setIsPending(false);
      return;
    }

    router.push(destination);
    router.refresh();
  }

  if (unconfirmed) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50">
          <MailWarning className="h-6 w-6 text-orange-600" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">
          Votre adresse n&apos;est pas encore confirmée
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Votre mot de passe est bon : il ne manque que la confirmation de{" "}
          <span className="font-medium text-slate-900">{unconfirmed}</span>. Le lien est dans
          votre boîte mail — le plus souvent dans les <strong>indésirables</strong>.
        </p>

        <div className="mt-5 space-y-3">
          <ResendConfirmation email={unconfirmed} />

          <button
            type="button"
            onClick={() => setUnconfirmed(null)}
            className="text-xs font-semibold text-slate-500 transition-all duration-200 hover:text-slate-900"
          >
            Revenir à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vous@exemple.com"
        />
      </div>

      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
