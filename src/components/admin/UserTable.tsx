"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, MailCheck, MailX, Shield } from "lucide-react";

import {
  setAccountType,
  type AccountTypeState,
} from "@/app/(admin)/admin/(dashboard)/utilisateurs/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AccountType, AdminUser } from "@/lib/admin";

/**
 * Les comptes, et le seul geste qui compte : changer le type.
 *
 * **L'adresse non confirmée est mise en avant, pas reléguée.** C'est le
 * premier symptôme d'un problème d'acheminement du courrier, et c'est arrivé
 * en production : des partenaires inscrits n'ont jamais reçu leur lien. Un
 * écran qui le montre d'un coup d'œil évite de le découvrir par une
 * réclamation.
 *
 * **Passer quelqu'un en `admin` demande une confirmation.** Les trois autres
 * types se défont sans conséquence ; celui-là ouvre le back-office entier, et
 * un clic de trop sur une liste est vite arrivé.
 */

const TYPES: { value: AccountType; label: string }[] = [
  { value: "particulier", label: "Particulier" },
  { value: "entreprise", label: "Entreprise" },
  { value: "partenaire", label: "Partenaire" },
  { value: "admin", label: "Administration" },
];

const COULEURS: Record<AccountType, string> = {
  particulier: "bg-slate-100 text-slate-700",
  entreprise: "bg-teal-50 text-teal-700",
  partenaire: "bg-orange-50 text-orange-700",
  admin: "bg-red-50 text-red-700",
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function jour(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : JOUR.format(d);
}

export function UserTable({ users }: { users: AdminUser[] }) {
  return (
    <ul className="space-y-3">
      {users.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}
    </ul>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const [state, action, pending] = React.useActionState<AccountTypeState, FormData>(
    setAccountType,
    {},
  );
  const [choisi, setChoisi] = React.useState<AccountType>(user.accountType);

  // Passer quelqu'un en administration se confirme : le geste ouvre tout le
  // back-office, et rien ne le distingue visuellement des trois autres.
  const dangereux = choisi === "admin" && user.accountType !== "admin";
  const change = choisi !== user.accountType;

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <span className="truncate">{user.fullName ?? "Sans nom"}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${COULEURS[user.accountType]}`}
            >
              {user.accountType}
            </span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="truncate">{user.email}</span>
            {user.phone ? <span>{user.phone}</span> : null}

            {user.emailConfirmed ? (
              <span className="flex items-center gap-1 text-teal-700">
                <MailCheck className="h-3 w-3" aria-hidden />
                Adresse confirmée
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-amber-700">
                <MailX className="h-3 w-3" aria-hidden />
                Adresse jamais confirmée
              </span>
            )}
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
            <span>Inscrit le {jour(user.createdAt)}</span>
            <span>Dernière connexion : {jour(user.lastSignInAt)}</span>
            {user.orgCount > 0 ? (
              <span>
                {user.orgCount} organisation{user.orgCount > 1 ? "s" : ""}
              </span>
            ) : null}
          </p>
        </div>

        <form action={action} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="accountType" value={choisi} />

          <Select
            aria-label={`Type de compte de ${user.fullName ?? user.email}`}
            value={choisi}
            onChange={(e) => setChoisi(e.target.value as AccountType)}
            className="h-9 w-40 text-xs"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>

          <Button type="submit" disabled={!change || pending} className="h-9 px-3 text-xs">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Appliquer"}
          </Button>
        </form>
      </div>

      {dangereux ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Ce compte ouvrira le back-office entier</strong> : comptes, finances,
            modération, interrupteurs. À ne donner qu&apos;à quelqu&apos;un de l&apos;équipe.
          </span>
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
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
