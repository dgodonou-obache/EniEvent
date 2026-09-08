import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  Eye,
  FileWarning,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireSpace } from "@/lib/auth/session";
import { getPartnerStats } from "@/lib/partner";
import { getPartnerQuoteStats } from "@/lib/quotes";

export const metadata = { title: "Tableau de bord" };

export default async function PartnerDashboardPage() {
  const { context, decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const [stats, quotes] = await Promise.all([
    getPartnerStats(decision.org.orgId),
    getPartnerQuoteStats(decision.org.orgId),
  ]);

  const firstName = context.fullName?.split(" ")[0];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {firstName ? `Bonjour ${firstName}` : "Tableau de bord"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{decision.org.orgName}</p>
        </div>

        <Link href="/pro/annonces/nouvelle">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvelle annonce
          </Button>
        </Link>
      </div>

      {/* Ce qui appelle une action passe avant les compteurs. Une demande sans
          réponse est une vente perdue le jour où le délai expire : elle passe
          donc en tête. */}
      {quotes.openRequests > 0 ? (
        <Alert
          tone="info"
          icon={ClipboardList}
          title={`${quotes.openRequests} demande${quotes.openRequests > 1 ? "s" : ""} de devis vous concerne${quotes.openRequests > 1 ? "nt" : ""}`}
          body={
            quotes.drafts > 0
              ? `Dont ${quotes.drafts} devis commencé${quotes.drafts > 1 ? "s" : ""} mais pas encore envoyé${quotes.drafts > 1 ? "s" : ""}.`
              : "Des clients attendent une proposition. Les premiers devis reçus sont les plus regardés."
          }
          href="/pro/demandes"
          cta="Voir les demandes"
        />
      ) : null}

      {stats.rejected > 0 ? (
        <Alert
          tone="danger"
          icon={FileWarning}
          title={`${stats.rejected} annonce${stats.rejected > 1 ? "s" : ""} à corriger`}
          body="Nos équipes ont demandé des modifications. Le motif est indiqué sur chaque annonce."
          href="/pro/annonces"
          cta="Voir les annonces"
        />
      ) : null}

      {stats.total === 0 ? (
        <Alert
          tone="info"
          icon={Plus}
          title="Publiez votre première annonce"
          body="Décrivez ce que vous proposez, fixez vos tarifs et ouvrez vos dates. La validation prend 48 h ouvrées."
          href="/pro/annonces/nouvelle"
          cta="Créer une annonce"
        />
      ) : null}

      {stats.total > 0 && stats.published > 0 && stats.openDays === 0 ? (
        <Alert
          tone="warning"
          icon={CalendarDays}
          title="Aucune date ouverte à la réservation"
          body="Vos annonces sont en ligne, mais personne ne peut réserver tant que votre planning est vide."
          href="/pro/planning"
          cta="Ouvrir des dates"
        />
      ) : null}

      {!stats.isVerified ? (
        <Alert
          tone="warning"
          icon={ShieldAlert}
          title="Votre compte n'est pas encore vérifié"
          body="Déposez vos pièces (RCCM, IFU, pièce d'identité du gérant) pour obtenir le badge « vérifié » et rassurer vos clients."
          href="/pro/documents"
          cta="Déposer mes pièces"
        />
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Eye} label="En ligne" value={stats.published} tone="teal" />
        <Stat icon={Clock} label="En vérification" value={stats.pending} tone="amber" />
        <Stat icon={FileWarning} label="Brouillons" value={stats.drafts} tone="slate" />
        <Stat icon={CalendarDays} label="Dates ouvertes" value={stats.openDays} tone="orange" />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <BadgeCheck
            className={stats.isVerified ? "h-5 w-5 text-teal-600" : "h-5 w-5 text-slate-300"}
            aria-hidden
          />
          Réputation
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {stats.ratingCount > 0
            ? `${Number(stats.ratingAvg).toFixed(1)} sur 5, sur ${stats.ratingCount} avis.`
            : "Pas encore d'avis. Ils apparaîtront après vos premiers événements."}
        </p>
      </div>
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
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone]}`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

const ALERT_TONES = {
  danger: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-orange-200 bg-orange-50 text-orange-900",
} as const;

function Alert({
  tone,
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  tone: keyof typeof ALERT_TONES;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div
      className={`mb-3 flex flex-wrap items-start gap-4 rounded-2xl border p-4 ${ALERT_TONES[tone]}`}
    >
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
