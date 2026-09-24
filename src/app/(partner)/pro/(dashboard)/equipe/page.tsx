import { Users } from "lucide-react";

import { TeamInvite } from "@/components/shared/TeamInvite";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getTeam } from "@/lib/company";
import { getPendingInvitations } from "@/lib/invitations";
import {
  PARTNER_ROLES,
  PARTNER_ROLE_HINTS,
  PARTNER_ROLE_LABELS,
} from "@/lib/validation/partner";
import { formatBeninPhone } from "@/lib/validation/phone";

/**
 * L'équipe du partenaire.
 *
 * Le pendant de `/entreprise/equipe`, et il lit la même table par la même
 * fonction : `organization_members` ne distingue les deux mondes que par
 * `org_type`, et `getTeam` ne fait aucune hypothèse. Seuls les libellés de
 * rôles changent — `PARTNER_ROLES` au lieu de `COMPANY_ROLES`.
 *
 * **L'invitation par courriel** (migration 0042) a demandé une table à part.
 * `organization_members.user_id` référence `profiles(id)` : on ne peut y
 * inscrire quelqu'un qu'une fois son compte créé, alors qu'inviter un
 * collègue, c'est précisément s'adresser à quelqu'un qui n'en a pas encore.
 * Le lot C avait buté là-dessus et reporté plutôt que d'ajouter à moitié.
 *
 * ⚠️ **Seuls `owner` et `manager` invitent.** Un équipier qui pourrait ajouter
 * des membres contournerait la hiérarchie de la structure en un clic.
 * `invite_member` le refuse déjà ; l'écran n'offre pas le geste, pour ne pas
 * proposer ce que la base rejettera.
 */

export const metadata = { title: "Équipe" };

const STATUTS: Record<string, { label: string; classe: string }> = {
  active: { label: "Actif", classe: "bg-teal-50 text-teal-700" },
  invited: { label: "Invité", classe: "bg-amber-50 text-amber-700" },
  revoked: { label: "Retiré", classe: "bg-slate-100 text-slate-600" },
};

export default async function PartnerTeamPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const team = await getTeam(decision.org.orgId);
  const invitations = await getPendingInvitations(decision.org.orgId);
  const actifs = team.filter((m) => m.status === "active");
  const peutInviter = decision.org.role === "owner" || decision.org.role === "manager";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Équipe</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qui travaille sur vos annonces. {decision.org.orgName}
        </p>
      </div>

      <TeamInvite
        space="partner"
        roles={PARTNER_ROLES}
        pending={invitations}
        roleLabels={PARTNER_ROLE_LABELS}
        canInvite={peutInviter}
      />

      {actifs.length === 1 && invitations.length === 0 ? (
        <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          <strong>Vous êtes seul sur ce compte.</strong> Un collègue qui reçoit une invitation
          créera son compte au passage : il n&apos;a rien à préparer de son côté.
        </p>
      ) : null}

      {team.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Personne dans l'équipe"
          description="C'est inattendu : le compte qui a créé la structure devrait y figurer. Signalez-le-nous."
        />
      ) : (
        <ul className="space-y-2">
          {team.map((m) => {
            const statut = STATUTS[m.status] ?? STATUTS.revoked;
            const profil = m.profiles;

            return (
              <li
                key={m.user_id}
                className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="truncate">{profil?.full_name ?? "Sans nom"}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statut.classe}`}
                      >
                        {statut.label}
                      </span>
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {PARTNER_ROLE_HINTS[m.role] ?? "Rôle sur cette structure."}
                    </p>

                    {profil?.phone ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatBeninPhone(profil.phone)}
                      </p>
                    ) : null}
                  </div>

                  <span className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    {PARTNER_ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
