import Link from "next/link";
import { Search } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { AccountNav } from "@/components/account/AccountNav";
import { SessionTimeout } from "@/components/auth/SessionTimeout";
import { identityOf, requireSpace } from "@/lib/auth/session";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // L'espace personnel est ouvert à tout compte authentifié : la décision ne
  // peut pas refuser ici, mais elle passe par le même chemin que les autres.
  const { context } = await requireSpace("account");
  const identity = identityOf(context);

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Couvre /compte et /projets, tous deux sous ce groupe de routes.
          La déconnexion ordinaire ramène à l'accueil ; une session expirée va
          à la connexion, qui peut en expliquer la raison. */}
      <SessionTimeout signInTo="/connexion" />

      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            <span className="text-orange-500">Éni</span>Event
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {/* Le passage vers le catalogue, dit en toutes lettres.

                ⚠️ Ce lien **n'existe que dans l'espace client**, et c'est une
                exception assumée à la règle §4 : un particulier est d'abord un
                visiteur de la place de marché, il doit pouvoir retourner
                chercher un lieu sans se déconnecter. Un partenaire ou un
                administrateur, eux, n'ont rien à faire sur la vitrine — leurs
                espaces restent sans porte de sortie. */}
            <Link
              href="/recherche"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Explorer</span>
            </Link>

            <span className="hidden truncate text-sm font-medium text-slate-600 sm:block">
              {identity.name}
            </span>
            <form action={signOut.bind(null, "/")}>
              <button
                type="submit"
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <AccountNav />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
