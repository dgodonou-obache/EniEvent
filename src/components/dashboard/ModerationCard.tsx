"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import {
  approveListing,
  rejectListing,
  type ModerationState,
} from "@/app/(admin)/admin/moderation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, money } from "@/lib/money";
import type { ModerationItem } from "@/lib/admin";

const REJECTION_REASONS = [
  "La description est trop succincte : précisez ce qui est inclus dans la prestation.",
  "Le tarif indiqué paraît erroné. Vérifiez le montant et l'unité de facturation.",
  "Les conditions de paiement et d'annulation manquent ou sont ambiguës.",
  "Les capacités annoncées ne correspondent pas au type de lieu décrit.",
];

/**
 * Une annonce en attente, avec sa décision.
 *
 * Le motif de refus est prérempli par des formulations types, mais reste
 * modifiable : un motif générique n'aide pas le partenaire à corriger.
 */
export function ModerationCard({ item }: { item: ModerationItem }) {
  const [approveState, approve, approving] = React.useActionState<ModerationState, FormData>(
    approveListing,
    {},
  );
  const [rejectState, reject, rejecting] = React.useActionState<ModerationState, FormData>(
    rejectListing,
    {},
  );
  const [showRejection, setShowRejection] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const org = item.organizations;
  const venue = item.venue_details;
  const service = item.service_details;
  const rule = item.pricing_rules?.[0];

  // Points de contrôle : ce qu'un modérateur vérifie systématiquement, rendu
  // visible plutôt que laissé à sa mémoire.
  const checks = [
    { label: "Description", ok: (item.description?.trim().length ?? 0) >= 40 },
    { label: "Tarif", ok: item.price_from != null },
    { label: "Conditions de paiement", ok: Boolean(item.payment_terms) },
    { label: "Prix plancher", ok: item.min_price != null },
    {
      label: item.kind === "venue" ? "Capacités" : "Périmètre",
      ok: item.kind === "venue" ? venue?.capacity_standing != null : service?.max_guests != null,
    },
  ];

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-900">{item.title}</h2>
            <Badge variant="secondary">{item.categories?.name}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {org?.brand_name ?? org?.legal_name} · {item.city}
            {item.district ? ` (${item.district})` : ""}
          </p>
        </div>

        <p className="shrink-0 text-right text-sm">
          {item.price_from != null ? (
            <span className="font-bold text-slate-900">{format(money(item.price_from))}</span>
          ) : (
            <span className="text-red-600">aucun tarif</span>
          )}
          {rule ? <span className="block text-xs text-slate-400">unité : {rule.unit}</span> : null}
        </p>
      </div>

      {item.description ? (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          {item.description}
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Aucune description.
        </p>
      )}

      <ul className="mt-4 flex flex-wrap gap-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={
              check.ok
                ? "rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700"
                : "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
            }
          >
            {check.ok ? "✓" : "!"} {check.label}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <form action={approve}>
          <input type="hidden" name="listingId" value={item.id} />
          <Button type="submit" size="sm" disabled={approving}>
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
            Valider et publier
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowRejection((open) => !open)}
          aria-expanded={showRejection}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Renvoyer au partenaire
        </Button>

        {approveState.message ? (
          <p role="status" className="text-sm font-medium text-teal-700">
            {approveState.message}
          </p>
        ) : null}
        {approveState.error ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {approveState.error}
          </p>
        ) : null}
      </div>

      {showRejection ? (
        <form action={reject} className="mt-4 animate-slide-up border-t border-slate-100 pt-4">
          <input type="hidden" name="listingId" value={item.id} />

          <label htmlFor={`reason-${item.id}`} className="mb-2 block text-sm font-bold text-slate-900">
            Motif du refus
          </label>

          <div className="mb-2 flex flex-wrap gap-2">
            {REJECTION_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
              >
                {preset.split(" ").slice(0, 4).join(" ")}…
              </button>
            ))}
          </div>

          <Textarea
            id={`reason-${item.id}`}
            name="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ce texte est envoyé tel quel au partenaire : dites-lui quoi corriger."
          />

          <div className="mt-3 flex items-center gap-3">
            <Button type="submit" variant="destructive" size="sm" disabled={rejecting}>
              {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Envoyer le refus
            </Button>
            {rejectState.error ? (
              <p role="alert" className="text-sm font-medium text-red-600">
                {rejectState.error}
              </p>
            ) : null}
            {rejectState.message ? (
              <p role="status" className="text-sm font-medium text-slate-600">
                {rejectState.message}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </article>
  );
}
