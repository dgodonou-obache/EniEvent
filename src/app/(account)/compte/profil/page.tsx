import { PasswordForm } from "@/components/auth/PasswordForm";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Profil" };

export default async function ProfilPage() {
  // Le layout de l'espace a déjà exigé une session : elle existe forcément ici.
  const context = await getSessionContext();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profil</h1>
      <p className="mt-1 text-sm text-slate-500">Vos informations et votre mot de passe.</p>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5">
        <h2 className="font-bold text-slate-900">Identité</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Nom</dt>
            <dd className="font-medium text-slate-900">{context?.fullName ?? "Non renseigné"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Adresse e-mail</dt>
            <dd className="truncate font-medium text-slate-900">{context?.user.email}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          La modification du nom et de l&apos;adresse arrive avec le lot 3.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5">
        <h2 className="font-bold text-slate-900">Mot de passe</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choisissez-en un nouveau. L&apos;ancien cesse de fonctionner aussitôt.
        </p>
        <div className="mt-4">
          <PasswordForm apres="/compte/profil" />
        </div>
      </section>
    </div>
  );
}
