import { CommissionTable } from "@/components/admin/CommissionTable";
import { requireUser } from "@/lib/auth/session";
import { getCommissionSettings } from "@/lib/admin";

/**
 * Partenaires et commissions.
 *
 * **La commission est le seul revenu de la plateforme** depuis la migration
 * 0034 : plus aucun frais n'est facturé au client, qui paie exactement le prix
 * affiché sur la fiche. Tout le modèle économique se règle donc ici.
 *
 * Elle se décide partenaire par partenaire. Un taux propre l'emporte sur le
 * barème général ; l'écran montre les deux, un taux affiché sans son origine
 * se lisant comme une décision qu'on aurait prise sur ce partenaire.
 */

export const metadata = { title: "Partenaires" };

export default async function AdminPartnersPage() {
  await requireUser("/admin/connexion");

  const settings = await getCommissionSettings();

  const propres = settings.partners.filter((p) => p.override !== null).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Partenaires</h1>
        <p className="mt-1 text-sm text-slate-500">
          {settings.partners.length} partenaire{settings.partners.length > 1 ? "s" : ""}
          {propres > 0
            ? ` · ${propres} avec un taux propre, les autres au barème général`
            : " · tous au barème général"}
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Le client ne paie aucun frais.</strong> Il règle le prix affiché par le
        prestataire, sans supplément d&apos;aucune sorte. La commission ci-dessous est
        prélevée sur la part du partenaire au moment de l&apos;encaissement — elle est donc
        invisible côté client, et c&apos;est la seule rémunération de la plateforme.
      </p>

      <CommissionTable settings={settings} />
    </div>
  );
}
