"use client";

import * as React from "react";
import { Check, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

/**
 * Redemander le lien de confirmation.
 *
 * **Ce bouton manquait, et c'est ce qui bloquait vraiment.** Un partenaire dont
 * le courriel tombe dans les indésirables n'avait aucune issue : se réinscrire
 * ne faisait rien, et se connecter répondait « adresse ou mot de passe
 * incorrect ». Trois impasses d'affilée pour un compte parfaitement valide.
 *
 * Supabase borne lui-même la cadence (`smtp_max_frequency`, 60 secondes par
 * adresse) : inutile d'ajouter un compteur ici, qui ne ferait que mentir sur
 * une limite qu'on n'applique pas.
 */

export function ResendConfirmation({ email }: { email: string }) {
  const [etat, setEtat] = React.useState<"repos" | "envoi" | "parti" | "trop-tot">("repos");

  async function renvoyer() {
    setEtat("envoi");

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    // Une cadence dépassée n'est pas un échec : le message précédent est parti,
    // et le redire ainsi évite de faire cliquer dans le vide.
    if (error) {
      const brut = error.message.toLowerCase();
      setEtat(brut.includes("rate") || brut.includes("seconds") ? "trop-tot" : "repos");
      return;
    }

    setEtat("parti");
  }

  if (etat === "parti") {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-teal-700">
        <Check className="h-4 w-4" aria-hidden />
        Lien renvoyé. Pensez à regarder dans vos indésirables.
      </p>
    );
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={renvoyer} disabled={etat === "envoi"}>
        {etat === "envoi" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        Renvoyer le lien de confirmation
      </Button>

      {etat === "trop-tot" ? (
        <p className="mt-2 text-xs text-slate-500">
          Un lien vient déjà d&apos;être envoyé. Patientez une minute avant de réessayer.
        </p>
      ) : null}
    </div>
  );
}
