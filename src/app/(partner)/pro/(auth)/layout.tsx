import Link from "next/link";

/**
 * Accès à l'espace partenaire. Volontairement distinct de l'authentification
 * grand public : aucun lien ne renvoie vers `/connexion` (règle d'isolation).
 */
export default function PartnerAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/pro/connexion" className="text-2xl font-bold tracking-tight text-slate-900">
        <span className="text-orange-500">Éni</span>Event Pro
      </Link>

      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
