import Link from "next/link";
import { BadgeCheck, Building2, Clock, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/lib/admin";

export const metadata = { title: "Vue d'ensemble" };

export default async function AdminOverviewPage() {
  const stats = await getAdminOverview();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vue d&apos;ensemble</h1>
      <p className="mt-1 text-sm text-slate-500">
        Le pilotage financier et les litiges arriveront avec leurs lots. Pour l&apos;instant,
        l&apos;essentiel est la file de modération.
      </p>

      {stats.pending > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <Clock className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-orange-900">
              {stats.pending} annonce{stats.pending > 1 ? "s" : ""} en attente de validation
            </p>
            <p className="mt-0.5 text-sm text-orange-800/90">
              Chaque jour d&apos;attente est un jour où le partenaire ne vend pas.
            </p>
          </div>
          <Link href="/admin/moderation" className="shrink-0">
            <Button size="sm" className="bg-white text-orange-600 hover:bg-orange-100">
              Traiter la file
            </Button>
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Clock} label="À valider" value={stats.pending} href="/admin/moderation" />
        <Stat icon={Eye} label="Annonces en ligne" value={stats.published} href="/admin/annonces" />
        <Stat
          icon={Building2}
          label="Partenaires"
          value={stats.partners}
          href="/admin/partenaires"
        />
        <Stat
          icon={BadgeCheck}
          label="Dossiers KYC à vérifier"
          value={stats.unverifiedPartners}
          href="/admin/partenaires"
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
        <Icon className="h-5 w-5 text-orange-500" aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </Link>
  );
}
