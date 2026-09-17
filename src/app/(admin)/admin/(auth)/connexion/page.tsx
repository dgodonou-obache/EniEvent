import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { SignInForm } from "@/components/auth/SignInForm";
import { SignInNotice } from "@/components/auth/SignInNotice";

export const metadata = {
  title: "Administration",
  // Le back-office n'a rien à faire dans un index de moteur de recherche.
  robots: { index: false, follow: false },
};

/**
 * Entrée du back-office.
 *
 * Elle existe pour une raison simple : l'administration passait jusqu'ici par
 * `/connexion`, la page grand public, qui propose « Créer un compte » et
 * « Espace partenaire ». Une porte de service qui invite à ouvrir un compte
 * client est une porte mal placée — et c'est le seul espace où la création de
 * compte n'a aucun sens : un administrateur est **désigné**, jamais inscrit.
 *
 * Aucun lien de sortie vers les autres espaces, conformément à la règle
 * d'étanchéité (`CLAUDE.md` §4).
 */
export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string; raison?: string; erreur?: string }>;
}) {
  const { suivant, raison, erreur } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-100 bg-white p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
            <ShieldCheck className="h-6 w-6 text-white" aria-hidden />
          </div>

          <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">
            Administration ÉniEvent
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Accès réservé à l&apos;équipe.
          </p>

          <SignInNotice raison={raison} erreur={erreur} />

          <div className="mt-6">
            <SignInForm defaultRedirect="/admin" redirectTo={suivant} />
          </div>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link href="/admin/mot-de-passe-oublie" className="font-medium text-slate-500 hover:text-orange-600">
            Mot de passe oublié ?
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-slate-400">
          Un compte d&apos;administration ne se crée pas depuis cette page. Il est accordé
          depuis le back-office, à une personne déjà identifiée.
        </p>
      </div>
    </main>
  );
}
