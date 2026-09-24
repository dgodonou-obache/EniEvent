import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { getAuditEntityTypes, getAuditLog } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

/**
 * Le journal d'audit.
 *
 * **Il ne se parcourt pas, il s'interroge.** On y vient avec une question
 * précise — qui a validé cette annonce, quand ce taux est-il passé de 10 à 12,
 * qui a suspendu ce partenaire. D'où le filtre par type d'entité en tête et
 * l'ordre antichronologique, plutôt qu'une pagination fine dont personne ne se
 * sert.
 *
 * **Ce journal est écrit par la base, pas par l'application.** `app.log_event`
 * est appelée depuis les fonctions `security definer` : une transition d'état
 * y laisse donc une trace quel que soit le chemin emprunté — écran, script, ou
 * correction manuelle en console. C'est ce qui en fait une preuve.
 *
 * Les filtres n'offrent que des types **réellement présents** : une liste
 * figée proposerait des recherches qui ne rendent jamais rien.
 */

export const metadata = { title: "Journal d'audit" };

const HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Les types d'entité en clair. Un type inconnu s'affiche tel quel plutôt que d'être masqué. */
const ENTITES: Record<string, string> = {
  listing: "Annonce",
  order: "Commande",
  payment: "Paiement",
  payout: "Versement",
  refund: "Remboursement",
  quote: "Devis",
  quote_request: "Demande",
  organization: "Organisation",
  profile: "Compte",
  commission: "Commission",
  feature_flag: "Interrupteur",
  conversation: "Conversation",
  approval: "Validation",
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireUser("/admin/connexion");

  const { type } = await searchParams;
  const [entries, types] = await Promise.all([getAuditLog(type, 150), getAuditEntityTypes()]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les {entries.length} dernières décisions
          {type ? ` sur « ${ENTITES[type] ?? type} »` : ""}. Écrit par la base, pas par
          l&apos;interface.
        </p>
      </div>

      {types.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <FiltreLien href="/admin/journal" actif={!type} libelle="Tout" />
          {types.map((t) => (
            <FiltreLien
              key={t}
              href={`/admin/journal?type=${encodeURIComponent(t)}`}
              actif={type === t}
              libelle={ENTITES[t] ?? t}
            />
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={type ? "Aucune décision de ce type" : "Le journal est vide"}
          description={
            type
              ? "Choisissez un autre type, ou revenez à la vue complète."
              : "Les validations, changements de statut et mouvements d'argent s'y inscriront automatiquement."
          }
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-slate-100 bg-white p-3 transition-all duration-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {ENTITES[e.entityType] ?? e.entityType}
                  </span>
                  <span className="font-semibold text-slate-900">{e.action}</span>

                  {/* Un changement se lit « de → à ». Afficher le seul état
                      d'arrivée oblige à deviner ce qu'on a quitté. */}
                  {e.fromState || e.toState ? (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <span>{e.fromState ?? "—"}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      <span className="font-medium text-slate-700">{e.toState ?? "—"}</span>
                    </span>
                  ) : null}
                </p>

                <p className="shrink-0 text-[11px] text-slate-400">
                  {HORODATAGE.format(new Date(e.createdAt))}
                </p>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                <span>{e.actorName ?? (e.actorId ? "Compte supprimé" : "Automatique")}</span>
                {e.entityId ? <span className="font-mono">{e.entityId.slice(0, 8)}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FiltreLien({
  href,
  actif,
  libelle,
}: {
  href: string;
  actif: boolean;
  libelle: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.98] ${
        actif
          ? "border-orange-200 bg-orange-50 text-orange-600"
          : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
      }`}
    >
      {libelle}
    </Link>
  );
}
