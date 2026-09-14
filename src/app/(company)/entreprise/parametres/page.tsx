import { notFound } from "next/navigation";

import { CompanySettingsForm } from "@/components/company/CompanySettingsForm";
import { requireSpace } from "@/lib/auth/session";
import { getCompanyProfile, getCompanySettings } from "@/lib/company";
import { getBriefOptions } from "@/lib/quotes";

export const metadata = { title: "Paramètres" };

/** Alignés sur la politique RLS de `company_settings`. */
const MANAGERS = ["owner", "admin", "finance"];

export default async function CompanySettingsPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;

  const [profile, settings, options] = await Promise.all([
    getCompanyProfile(orgId),
    getCompanySettings(orgId),
    getBriefOptions(),
  ]);

  if (!profile) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-500">
          La fiche de {decision.org.orgName} et son circuit de validation.
        </p>
      </div>

      <CompanySettingsForm
        profile={profile}
        settings={settings}
        cities={options.cities}
        canManage={MANAGERS.includes(decision.org.role)}
      />
    </div>
  );
}
