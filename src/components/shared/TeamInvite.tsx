"use client";

import * as React from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";

import {
  cancelInvitation,
  inviteMember,
  type InviteState,
} from "@/app/invitation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFieldErrors } from "@/components/ui/use-field-errors";

/**
 * Inviter un collègue, et suivre les invitations en attente.
 *
 * Partagé par l'espace partenaire et l'espace entreprise : le geste est le
 * même, seuls les rôles proposés changent. Deux composants jumeaux auraient
 * divergé à la première retouche.
 *
 * ⚠️ **Le lien d'invitation n'est jamais affiché.** Il part par courriel, et
 * la base interdit même de le lire (`revoke select (token)`). Le montrer
 * permettrait de le transmettre par un autre canal — et l'invitation cesserait
 * de prouver que l'adresse est relevée par la bonne personne.
 */

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  /** Décidé côté serveur : `Date.now()` pendant le rendu serait impur. */
  expired: boolean;
}

interface Props {
  space: "partner" | "company";
  roles: readonly { value: string; label: string; hint: string }[];
  pending: PendingInvitation[];
  roleLabels: Record<string, string>;
  /** Faux pour un membre sans droit d'inviter : on n'offre alors rien. */
  canInvite: boolean;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function TeamInvite({ space, roles, pending, roleLabels, canInvite }: Props) {
  if (!canInvite && pending.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {canInvite ? <InviteForm space={space} roles={roles} /> : null}

      {pending.length > 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Invitations en attente
          </h2>

          <ul className="mt-2 space-y-1.5">
            {pending.map((i) => (
              <PendingRow
                key={i.id}
                invitation={i}
                space={space}
                roleLabel={roleLabels[i.role] ?? i.role}
                canCancel={canInvite}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InviteForm({ space, roles }: { space: Props["space"]; roles: Props["roles"] }) {
  const [state, action, pending] = React.useActionState<InviteState, FormData>(inviteMember, {});
  const [ouvert, setOuvert] = React.useState(false);
  const formRef = useFieldErrors(state.fields);

  const [role, setRole] = React.useState(roles[1]?.value ?? roles[0].value);
  const aide = roles.find((r) => r.value === role)?.hint;

  if (!ouvert) {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setOuvert(true)}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          Inviter un collègue
        </Button>

        {state.message ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-slate-100 bg-white p-4">
      <input type="hidden" name="space" value={space} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          name="email"
          type="email"
          required
          placeholder="Adresse e-mail du collègue"
          aria-label="Adresse e-mail"
          className="flex-1"
        />

        <Select
          name="role"
          aria-label="Rôle"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="sm:w-52"
        >
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Inviter"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
        </div>
      </div>

      {/* Ce que le rôle choisi permet réellement. Sans cette phrase, on choisit
          au hasard et on donne plus de droits que nécessaire. */}
      {aide ? <p className="mt-2 text-xs text-slate-500">{aide}</p> : null}

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Votre collègue recevra un lien valable quinze jours. Il ne fonctionnera qu&apos;avec cette
        adresse : s&apos;il a déjà un compte ÉniEvent sur une autre, il devra se connecter avec
        celle-ci.
      </p>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function PendingRow({
  invitation,
  space,
  roleLabel,
  canCancel,
}: {
  invitation: PendingInvitation;
  space: Props["space"];
  roleLabel: string;
  canCancel: boolean;
}) {
  const [state, action, pending] = React.useActionState<InviteState, FormData>(
    cancelInvitation,
    {},
  );

  const echeance = new Date(invitation.expiresAt);
  const perimee = invitation.expired;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
        {invitation.email}
      </span>

      <span className="shrink-0 text-slate-500">{roleLabel}</span>

      <span className={perimee ? "shrink-0 text-amber-700" : "shrink-0 text-slate-400"}>
        {perimee
          ? "Expirée"
          : `Jusqu'au ${Number.isNaN(echeance.getTime()) ? "—" : JOUR.format(echeance)}`}
      </span>

      {canCancel ? (
        <form action={action} className="shrink-0">
          <input type="hidden" name="id" value={invitation.id} />
          <input type="hidden" name="space" value={space} />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Retirer l'invitation de ${invitation.email}`}
            title={state.error ?? "Retirer cette invitation"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.9]"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </form>
      ) : null}
    </li>
  );
}
