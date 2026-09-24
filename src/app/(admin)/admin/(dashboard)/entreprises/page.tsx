import { Handshake } from "lucide-react";

import { CompanyTable } from "@/components/admin/CompanyTable";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminCompanies } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

/**
 * Les entreprises clientes.
 *
 * Le pendant de `/admin/partenaires`, côté acheteur. La différence de contenu
 * dit la différence de rôle : un partenaire se règle par sa **commission**,
 * une entreprise par son **accès**. Elle ne paie aucune commission — c'est un
 * client — et il n'y a donc rien à doser la concernant, seulement à ouvrir ou
 * à fermer.
 */

export const metadata = { title: "Entreprises" };

export default async function AdminCompaniesPage() {
  await requireUser("/admin/connexion");

  const companies = await getAdminCompanies();

  const actives = companies.filter((c) => c.status === "active").length;
  const suspendues = companies.filter((c) => c.status === "suspended").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Entreprises</h1>
        <p className="mt-1 text-sm text-slate-500">
          {companies.length} entreprise{companies.length > 1 ? "s" : ""} cliente
          {companies.length > 1 ? "s" : ""} · {actives} active{actives > 1 ? "s" : ""}
          {suspendues > 0 ? ` · ${suspendues} suspendue${suspendues > 1 ? "s" : ""}` : ""}
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        Une entreprise est un <strong>client</strong> : elle lance des appels d&apos;offres, engage
        un budget et paie le prix affiché. Elle ne verse aucune commission — celle-ci est prélevée
        sur la part du partenaire.
      </p>

      {companies.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Aucune entreprise inscrite"
          description="Les comptes créés depuis l'onglet « Entreprise » de l'inscription apparaîtront ici."
        />
      ) : (
        <CompanyTable companies={companies} />
      )}
    </div>
  );
}
