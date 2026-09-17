import Link from "next/link";
import { KeyRound } from "lucide-react";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié", robots: { index: false } };

/**
 * Réinitialisation pour l'administration.
 *
 * Elle existe pour la même raison que la page de connexion dédiée : le
 * formulaire public ramène sur `/compte` une fois le mot de passe changé, ce
 * qui déposerait un administrateur dans l'espace client.
 */
export default function AdminForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
          <KeyRound className="h-6 w-6 text-white" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">
          Mot de passe oublié
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Indiquez l&apos;adresse de votre compte d&apos;administration.
        </p>

        <div className="mt-6">
          <ForgotPasswordForm retour="/admin" />
        </div>

        <p className="mt-6 text-sm">
          <Link href="/admin/connexion" className="font-medium text-slate-500 hover:text-orange-600">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
