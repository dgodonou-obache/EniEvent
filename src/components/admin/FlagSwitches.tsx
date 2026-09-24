"use client";

import * as React from "react";
import { Check, Loader2, Power, PowerOff } from "lucide-react";

import {
  setFeatureFlag,
  type FlagState,
} from "@/app/(admin)/admin/(dashboard)/feature-flags/actions";
import { Button } from "@/components/ui/button";
import type { FeatureFlag } from "@/lib/admin";

/**
 * Les interrupteurs.
 *
 * **Couper se confirme, rallumer non.** L'asymétrie est voulue : rallumer
 * remet le produit dans son état normal, couper retire une fonctionnalité à
 * des gens qui sont peut-être en train de s'en servir. Le même motif que la
 * suspension d'une organisation.
 *
 * La description n'est pas une aide en ligne : c'est **ce qui se passe
 * réellement** quand on bascule. Sans elle, personne n'ose toucher — ou pire,
 * quelqu'un ose sans savoir.
 */

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function FlagSwitches({ flags }: { flags: FeatureFlag[] }) {
  return (
    <ul className="space-y-3">
      {flags.map((f) => (
        <FlagRow key={f.key} flag={f} />
      ))}
    </ul>
  );
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const [state, action, pending] = React.useActionState<FlagState, FormData>(setFeatureFlag, {});
  const [confirme, setConfirme] = React.useState(false);

  const date = new Date(flag.updatedAt);

  return (
    <li
      className={`rounded-2xl border p-4 transition-all duration-300 ${
        flag.enabled ? "border-slate-100 bg-white" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            {flag.enabled ? (
              <Power className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            ) : (
              <PowerOff className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            )}
            {flag.label}
            {!flag.enabled ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Coupé
              </span>
            ) : null}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{flag.description}</p>

          <p className="mt-1.5 text-[11px] text-slate-400">
            <span className="font-mono">{flag.key}</span>
            {Number.isNaN(date.getTime()) ? null : <> · modifié le {JOUR.format(date)}</>}
          </p>
        </div>

        {flag.enabled && !confirme ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirme(true)}
            className="h-9 shrink-0 px-3 text-xs"
          >
            Couper
          </Button>
        ) : (
          <form action={action} className="flex shrink-0 items-center gap-2">
            <input type="hidden" name="key" value={flag.key} />
            <input type="hidden" name="enabled" value={String(!flag.enabled)} />

            {flag.enabled ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirme(false)}
                className="h-9 px-3 text-xs"
              >
                Annuler
              </Button>
            ) : null}

            <Button
              type="submit"
              variant={flag.enabled ? "destructive" : "default"}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : flag.enabled ? (
                "Confirmer la coupure"
              ) : (
                "Rallumer"
              )}
            </Button>
          </form>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-900">
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
