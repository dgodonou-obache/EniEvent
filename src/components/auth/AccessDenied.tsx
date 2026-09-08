import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { denialMessage, type DenialReason, type Space } from "@/lib/auth/access";

interface AccessDeniedProps {
  reason: DenialReason;
  space: Space;
}

/**
 * Affiché quand l'utilisateur est bien connecté mais n'a rien à faire dans cet
 * espace. On explique et on propose une sortie, plutôt que de renvoyer en
 * silence vers une page de connexion — ce qui donnerait l'impression, à tort,
 * que la session a expiré.
 */
export function AccessDenied({ reason, space }: AccessDeniedProps) {
  const { title, body } = denialMessage(reason, space);
  const signOutTo = space === "partner" ? "/pro/connexion" : "/connexion";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50">
          <ShieldAlert className="h-6 w-6 text-orange-500" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          {reason === "no-organization" && space === "partner" ? (
            <Link href="/pro/inscription">
              <Button className="w-full sm:w-auto">Créer mon compte partenaire</Button>
            </Link>
          ) : null}

          <Link href="/">
            <Button variant="outline" className="w-full sm:w-auto">
              Retour à l&apos;accueil
            </Button>
          </Link>

          <form action={signOut.bind(null, signOutTo)}>
            <Button type="submit" variant="ghost" className="w-full sm:w-auto">
              Changer de compte
            </Button>
          </form>
        </div>

        <p className="mt-6 border-t border-slate-100 pt-5 text-xs text-slate-400">
          Besoin d&apos;aide ?{" "}
          <Link href="/contact" className="font-medium text-orange-600 hover:underline">
            Contacter le support
          </Link>
        </p>
      </div>
    </main>
  );
}
