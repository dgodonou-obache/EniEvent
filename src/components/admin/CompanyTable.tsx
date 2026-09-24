"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, Users } from "lucide-react";

import {
  setOrgStatus,
  type OrgStatusState,
} from "@/app/(admin)/admin/(dashboard)/entreprises/actions";
import { Button } from "@/components/ui/button";
import type { AdminCompany, OrgStatus } from "@/lib/admin";

/**
 * Les entreprises clientes.
 *
 * **Un seul geste, en deux temps.** Suspendre n'est pas une case à cocher : la
 * conséquence est immédiate et visible de l'extérieur. Le premier clic ouvre,
 * le second confirme — le même motif que l'annulation d'une réservation et que
 * les versements.
 */

const STATUTS: Record<OrgStatus, { label: string; classe: string }> = {
  pending: { label: "En attente", classe: "bg-amber-50 text-amber-700" },
  active: { label: "Active", classe: "bg-teal-50 text-teal-700" },
  suspended: { label: "Suspendue", classe: "bg-red-50 text-red-700" },
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function CompanyTable({ companies }: { companies: AdminCompany[] }) {
  return (
    <ul className="space-y-3">
      {companies.map((c) => (
        <CompanyRow key={c.orgId} company={c} />
      ))}
    </ul>
  );
}

function CompanyRow({ company }: { company: AdminCompany }) {
  const [state, action, pending] = React.useActionState<OrgStatusState, FormData>(setOrgStatus, {});
  const [ouvert, setOuvert] = React.useState(false);

  const suspendue = company.status === "suspended";
  const cible: OrgStatus = suspendue ? "active" : "suspended";
  const statut = STATUTS[company.status];

  const date = new Date(company.createdAt);

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <span className="truncate">{company.brandName ?? company.legalName}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statut.classe}`}
            >
              {statut.label}
            </span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {company.brandName ? <span className="truncate">{company.legalName}</span> : null}
            {company.city ? <span>{company.city}</span> : null}
            {company.billingEmail ? <span className="truncate">{company.billingEmail}</span> : null}
            {company.phone ? <span>{company.phone}</span> : null}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden />
              {company.memberCount} membre{company.memberCount > 1 ? "s" : ""}
            </span>
          </p>

          <p className="mt-1 text-[11px] text-slate-400">
            Inscrite le {Number.isNaN(date.getTime()) ? "—" : JOUR.format(date)}
          </p>
        </div>

        {ouvert ? (
          <form action={action} className="flex shrink-0 items-center gap-2">
            <input type="hidden" name="orgId" value={company.orgId} />
            <input type="hidden" name="status" value={cible} />

            <Button
              type="button"
              variant="ghost"
              onClick={() => setOuvert(false)}
              className="h-9 px-3 text-xs"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant={suspendue ? "default" : "destructive"}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : suspendue ? (
                "Confirmer la réactivation"
              ) : (
                "Confirmer la suspension"
              )}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOuvert(true)}
            className="h-9 shrink-0 px-3 text-xs"
          >
            {suspendue ? "Réactiver" : "Suspendre"}
          </Button>
        )}
      </div>

      {ouvert && !suspendue ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Ses membres perdent l&apos;accès à l&apos;espace entreprise. Les réservations et devis
            déjà engagés ne sont pas annulés — une suspension coupe l&apos;accès, elle ne défait
            pas ce qui a été conclu.
          </span>
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900"
        >
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
