import Link from "next/link";
import {
  BadgeCheck,
  FolderKanban,
  Plus,
  ShieldQuestion,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireSpace } from "@/lib/auth/session";
import { getCompanyOverview } from "@/lib/company";
import { DEFAULT_CURRENCY, format, money, type CurrencyCode } from "@/lib/money";
import { APPROVER_ROLES } from "@/lib/validation/company";

export const metadata = { title: "Tableau de bord" };

export default async function CompanyDashboardPage() {
  const { context, decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const stats = await getCompanyOverview(decision.org.orgId);
  const currency = DEFAULT_CURRENCY as CurrencyCode;
  const isApprover = APPROVER_ROLES.includes(decision.org.role);
  const firstName = context.fullName?.split(" ")[0];

  const remaining = stats.envelope - stats.committed;
  const usage = stats.envelope > 0 ? Math.round((stats.committed / stats.envelope) * 100) : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {firstName ? `Bonjour ${firstName}` : "Tableau de bord"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{decision.org.orgName}</p>
        </div>

        <Link href="/demande-de-devis">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvelle demande
          </Button>
        </Link>
      </div>

      {/* Ce qui bloque quelqu'un d'autre passe avant les compteurs : tant que
          l'aval n'est pas donné, le prestataire attend et la date approche. */}
      {stats.pendingApprovals > 0 ? (
        <Alert
          icon={ShieldQuestion}
          tone={isApprover ? "danger" : "info"}
          title={
            isApprover
              ? `${stats.pendingApprovals} engagement${stats.pendingApprovals > 1 ? "s" : ""} attend${stats.pendingApprovals > 1 ? "ent" : ""} votre aval`
              : `${stats.pendingApprovals} engagement${stats.pendingApprovals > 1 ? "s" : ""} en attente de validation`
          }
          body={
            stats.pendingAmount > 0
              ? `${format(money(stats.pendingAmount, currency))} au total. Chaque jour d'attente est un jour où le prestataire ne bloque pas la date.`
              : "Le prestataire attend une réponse pour bloquer la date."
          }
          href="/entreprise/validations"
          cta={isApprover ? "Décider" : "Voir"}
        />
      ) : null}

      {stats.costCenters === 0 ? (
        <Alert
          icon={Wallet}
          tone="info"
          title="Aucun centre de coût"
          body="Sans centre de coût, vos dépenses ne se rattachent à rien et le suivi budgétaire reste vide."
          href="/entreprise/budgets"
          cta="Créer un centre de coût"
        />
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="Demandes en cours" value={String(stats.open)} tone="orange" />
        <Stat
          icon={ShieldQuestion}
          label="En attente de validation"
          value={String(stats.awaitingApproval + stats.pendingApprovals)}
          tone="amber"
        />
        <Stat icon={BadgeCheck} label="Prestataires choisis" value={String(stats.awarded)} tone="teal" />
        <Stat
          icon={Wallet}
          label="Engagé"
          value={format(money(stats.committed, currency))}
          tone="slate"
          hint={stats.envelope > 0 ? `sur ${format(money(stats.envelope, currency))}` : undefined}
        />
      </div>

      {stats.envelope > 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold text-slate-900">Consommation budgétaire</h2>
            <p className="text-sm text-slate-500">
              {usage}&nbsp;% engagé · {format(money(Math.max(0, remaining), currency))} restant
            </p>
          </div>

          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${usage} % du budget engagé`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                remaining < 0 ? "bg-red-500" : (usage ?? 0) > 80 ? "bg-amber-500" : "bg-teal-500"
              }`}
              style={{ width: `${Math.min(100, usage ?? 0)}%` }}
            />
          </div>

          <p className="mt-3 text-sm text-slate-500">
            « Engagé » compte les offres retenues, pas les sommes versées : une offre acceptée
            engage l&apos;entreprise bien avant le premier paiement.
          </p>

          <Link
            href="/entreprise/budgets"
            className="mt-4 inline-block text-sm font-bold text-orange-600 hover:underline"
          >
            Détail par centre de coût
          </Link>
        </section>
      ) : null}
    </div>
  );
}

const TONES = {
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-800",
  orange: "bg-orange-50 text-orange-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone: keyof typeof TONES;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="mt-3 truncate text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

const ALERT_TONES = {
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-orange-200 bg-orange-50 text-orange-900",
} as const;

function Alert({
  icon: Icon,
  tone,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: keyof typeof ALERT_TONES;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className={`mb-3 flex flex-wrap items-start gap-4 rounded-2xl border p-4 ${ALERT_TONES[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{body}</p>
      </div>
      <Link href={href} className="shrink-0">
        <Button variant="outline" size="sm" className="bg-white">
          {cta}
        </Button>
      </Link>
    </div>
  );
}
