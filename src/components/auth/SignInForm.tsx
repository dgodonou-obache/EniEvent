"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [isPending, setIsPending] = React.useState(false);

  // Une destination venue de l'URL ne doit jamais pouvoir sortir du site.
  const destination =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : defaultRedirect;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Message volontairement identique pour un e-mail inconnu et un mot de
      // passe faux : distinguer les deux révélerait quels comptes existent.
      setError("Adresse e-mail ou mot de passe incorrect.");
      setIsPending(false);
      return;
    }

    router.push(destination);
    router.refresh();
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
        <Input
          id="password"
          name="password"
          type="password"
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
