import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié" };

/**
 * Même formulaire, porte partenaire. Un prestataire ne doit jamais être
 * renvoyé vers la connexion grand public (`CLAUDE.md` §4) — le retour après
 * réinitialisation le ramène donc dans son espace.
 */
export default function PartnerForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-slate-500">
        Indiquez l&apos;adresse de votre compte partenaire.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm retour="/pro/dashboard" />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        <Link href="/pro/connexion" className="font-medium text-orange-600 hover:underline">
          Retour à la connexion partenaire
        </Link>
      </p>
    </>
  );
}
