import Link from "next/link";

import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Connexion partenaire" };

export default async function PartnerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string }>;
}) {
  const { suivant } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Espace partenaire</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gérez vos annonces, votre planning, vos devis et vos versements.
      </p>

      <div className="mt-6">
        <SignInForm defaultRedirect="/pro/dashboard" redirectTo={suivant} />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Vous n&apos;êtes pas encore référencé ?{" "}
        <Link href="/pro/inscription" className="font-medium text-orange-600 hover:underline">
          Devenir partenaire
        </Link>
      </p>
    </>
  );
}
