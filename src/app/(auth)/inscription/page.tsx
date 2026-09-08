import Link from "next/link";

import { SignUpTabs } from "@/components/auth/SignUpTabs";

export const metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Créer un compte</h1>
      <p className="mt-1 text-sm text-slate-500">
        Réservez vos lieux et prestataires, ou demandez plusieurs devis d&apos;un coup.
      </p>

      <div className="mt-6">
        <SignUpTabs />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Vous avez déjà un compte ?{" "}
        <Link href="/connexion" className="font-medium text-orange-600 hover:underline">
          Se connecter
        </Link>
      </p>

      <p className="mt-2 text-sm text-slate-500">
        Vous proposez un service événementiel ?{" "}
        <Link href="/pro/inscription" className="font-medium text-orange-600 hover:underline">
          Devenir partenaire
        </Link>
      </p>
    </>
  );
}
