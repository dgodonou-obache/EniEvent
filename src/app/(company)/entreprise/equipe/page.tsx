import { Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { getTeam } from "@/lib/company";
import { formatBeninPhone } from "@/lib/validation/phone";
import { APPROVER_ROLES, COMPANY_ROLES } from "@/lib/validation/company";

export const metadata = { title: "Équipe" };

const ROLE_HINTS = Object.fromEntries(COMPANY_ROLES.map((role) => [role.value, role.hint]));
const ROLE_LABELS = Object.fromEntries(COMPANY_ROLES.map((role) => [role.value, role.label]));

export default async function TeamPage() {
  const { context, decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const team = await getTeam(decision.org.orgId);
  const approvers = team.filter(
    (member) => APPROVER_ROLES.includes(member.role) && member.status === "active",
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Équipe</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qui peut demander, qui peut engager. {decision.org.orgName}
        </p>
      </div>

      {/* Sans valideur, aucun engagement au-dessus du seuil ne peut aboutir :
          les demandes resteraient en attente sans que personne ne comprenne. */}
      {approvers.length === 0 ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-bold">Aucun valideur actif.</span> Si un seuil de validation est
          fixé, les engagements qui le dépassent resteront bloqués. Attribuez le rôle
          « Valideur » à quelqu&apos;un, ou retirez le seuil dans les paramètres.
        </p>
      ) : null}

      {team.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Personne dans l'équipe"
          description="Les membres rattachés à votre entreprise apparaîtront ici avec leur rôle."
        />
      ) : (
        <ul className="space-y-3">
          {team.map((member) => {
            const isMe = member.user_id === context.user.id;

            return (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                    {(member.profiles?.full_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">
                      {member.profiles?.full_name ?? "Membre"}
                      {isMe ? <span className="ml-2 text-xs text-slate-400">vous</span> : null}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {member.profiles?.phone
                        ? formatBeninPhone(member.profiles.phone)
                        : "Téléphone non renseigné"}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {ROLE_LABELS[member.role] ?? member.role}
                  </p>
                  <p className="max-w-[16rem] text-xs text-slate-400">
                    {ROLE_HINTS[member.role] ?? ""}
                  </p>
                  {member.status !== "active" ? (
                    <p className="text-xs font-bold text-amber-700">
                      {member.status === "invited" ? "Invitation en attente" : "Accès révoqué"}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-sm text-slate-500">
        L&apos;invitation de nouveaux membres arrive avec le lot 6. En attendant, un collègue
        crée son compte puis vous nous demandez de le rattacher.
      </p>
    </div>
  );
}
