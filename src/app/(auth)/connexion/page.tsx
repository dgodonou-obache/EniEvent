import Link from "next/link";

import { SignInNotice } from "@/components/auth/SignInNotice";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Connexion" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string; raison?: string; erreur?: string }>;
}) {
  const { suivant, raison, erreur } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connexion</h1>
      <p className="mt-1 text-sm text-slate-500">
        Accédez à vos réservations, vos projets et vos devis.
      </p>

      <SignInNotice raison={raison} erreur={erreur} />


      


      <div className="mt-6">
        <SignInForm defaultRedirect="/compte" redirectTo={suivant} />
      </div>

      <p className="mt-4 text-sm text-slate-500">
        <Link href="/mot-de-passe-oublie" className="font-medium text-orange-600 hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>

      <p className="mt-6 text-sm text-slate-500">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-medium text-orange-600 hover:underline">
          Créer un compte
        </Link>
      </p>

      <p className="mt-2 text-sm text-slate-500">
        Vous êtes prestataire ?{" "}
        <Link href="/pro/connexion" className="font-medium text-orange-600 hover:underline">
          Espace partenaire
        </Link>
      </p>
    </>
  );
}
