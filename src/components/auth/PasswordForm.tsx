"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordSchema } from "@/lib/validation/auth";
import { createClient } from "@/utils/supabase/client";

/**
 * Choix d'un nouveau mot de passe.
 *
 * Sert aux deux cas, qui ne diffèrent que par la manière dont la session a été
 * obtenue : après un lien de réinitialisation, ou depuis un compte déjà
 * connecté. Dans les deux cas Supabase exige une session — c'est elle qui
 * prouve l'identité, pas l'ancien mot de passe.
 *
 * La confirmation n'est pas une formalité : sans elle, une faute de frappe
 * enferme dehors quelqu'un qui vient précisément de perdre son accès.
 */
export function PasswordForm({
  apres,
  libelle = "Changer le mot de passe",
}: {
  /** Où aller une fois le mot de passe changé. */
  apres: string;
  libelle?: string;
}) {
  const router = useRouter();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [fait, setFait] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur(null);

    const formData = new FormData(event.currentTarget);
    const motDePasse = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    const verdict = passwordSchema.safeParse(motDePasse);
    if (!verdict.success) {
      setErreur(verdict.error.issues[0]?.message ?? "Mot de passe trop faible.");
      return;
    }

    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setIsPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: motDePasse });

    if (error) {
      // Cas le plus fréquent : le lien a expiré, la session n'existe plus.
      setErreur(
        error.message.toLowerCase().includes("session")
          ? "Votre lien a expiré. Demandez-en un nouveau."
          : "Le changement a échoué. Réessayez dans un instant.",
      );
      setIsPending(false);
      return;
    }

    setFait(true);
    setIsPending(false);
    router.refresh();
  }

  if (fait) {
    return (
      <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
        <p className="flex items-center gap-2 font-medium text-teal-900">
          <Check className="h-5 w-5 shrink-0" aria-hidden />
          Mot de passe modifié
        </p>
        <p className="mt-1 text-sm text-teal-800/90">
          Il sera demandé à votre prochaine connexion. Vos autres appareils restent
          connectés jusqu&apos;à l&apos;expiration de leur session.
        </p>
        <Button className="mt-4" onClick={() => router.push(apres)}>
          Continuer
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby="regle-mdp"
        />
        <p id="regle-mdp" className="mt-1.5 text-xs text-slate-400">
          Au moins 10 caractères, dont une lettre et un chiffre.
        </p>
      </div>

      <div>
        <Label htmlFor="confirmation">Confirmer</Label>
        <Input id="confirmation" name="confirmation" type="password" required autoComplete="new-password" />
      </div>

      {erreur ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {libelle}
      </Button>
    </form>
  );
}
