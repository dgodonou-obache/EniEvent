"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { SignUpForm } from "./SignUpForm";

const TABS = [
  {
    value: "particulier" as const,
    label: "Particulier",
    hint: "Mariage, anniversaire, baptême, réception privée.",
    redirectTo: "/compte",
  },
  {
    value: "entreprise" as const,
    label: "Entreprise",
    hint: "Séminaire, conférence, soirée d'entreprise, team building.",
    redirectTo: "/entreprise",
  },
];

export function SignUpTabs() {
  const [active, setActive] = React.useState<"particulier" | "entreprise">("particulier");
  const current = TABS.find((t) => t.value === active)!;

  return (
    <div>
      <div role="tablist" aria-label="Type de compte" className="grid grid-cols-2 gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active === tab.value}
            onClick={() => setActive(tab.value)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
              active === tab.value
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">{current.hint}</p>

      <div className="mt-6">
        {/* La clé force le remontage : changer d'onglet vide les champs propres
            à l'autre formulaire au lieu de les conserver invisibles. */}
        <SignUpForm key={active} variant={active} redirectTo={current.redirectTo} />
      </div>
    </div>
  );
}
