import { PasswordForm } from "@/components/auth/PasswordForm";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Paramètres" };

/**
 * Paramètres du compte d'administration.
 *
 * Volontairement réduit au mot de passe : un administrateur reçoit ses
 * identifiants par courrier lors de l'ouverture de son compte
 * (`npm run admin:creer`), et doit pouvoir les remplacer sans dépendre de qui
 * les lui a transmis.
 */
export default async function AdminSettingsPage() {
  const context = await getSessionContext();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres</h1>
      <p className="mt-1 text-sm text-slate-500">
        Le paramétrage de la plateforme — commissions, villes, drapeaux — arrive au lot 7.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5">
        <h2 className="font-bold text-slate-900">Mon compte</h2>
        <p className="mt-1 text-sm text-slate-500">{context?.user.email}</p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5">
        <h2 className="font-bold text-slate-900">Mot de passe</h2>
        <p className="mt-1 text-sm text-slate-500">
          À changer dès la première connexion : celui reçu par courrier a transité par
          une boîte mail.
        </p>
        <div className="mt-4">
          <PasswordForm apres="/admin" />
        </div>
      </section>
    </div>
  );
}
