import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-slate-500">
        Indiquez votre adresse : nous vous enverrons un lien pour en choisir un nouveau.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm retour="/compte" />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Vous vous en souvenez ?{" "}
        <Link href="/connexion" className="font-medium text-orange-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
