"use client";

import * as React from "react";
import { BadgeCheck, Check, ChevronDown, Info, Loader2, ShieldQuestion, X } from "lucide-react";

import {
  requestQuoteApproval,
  type CompanyState,
} from "@/app/(company)/entreprise/actions";
import {
  acceptQuote,
  declineQuote,
  type ProjectState,
} from "@/app/(account)/projets/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, money, type CurrencyCode } from "@/lib/money";
import { QUOTE_STATUS_LABELS_CLIENT, type QuoteStatus } from "@/lib/states";
import { UNIT_LABELS, type PriceUnit } from "@/lib/units";

/**
 * Comparateur d'offres, besoin par besoin.
 *
 * Le classement se fait sur le prix parce que c'est le seul critère objectif
 * dont on dispose — mais le montant le plus bas est signalé comme un fait, pas
 * comme une recommandation. Le détail de chaque offre est dépliable : comparer
 * deux totaux sans voir ce qu'ils recouvrent est le meilleur moyen de choisir
 * la mauvaise.
 */

interface Line {
  id: string;
  label: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number | null;
}

interface Quote {
  id: string;
  reference: string;
  status: string;
  subtotal: number;
  currency: string;
  message: string | null;
  valid_until: string | null;
  sent_at: string | null;
  decline_reason: string | null;
  organizations: { brand_name: string | null; legal_name: string; city: string | null } | null;
  quote_lines: Line[];
}

interface Item {
  id: string;
  awarded_quote_id: string | null;
  /** Enveloppe que le client s'est fixée pour cette prestation. */
  budget_max: number | null;
  categories: { name: string } | null;
  quotes: Quote[];
}

export interface ApprovalRules {
  /** Au-delà, retenir une offre demande l'aval d'un valideur. */
  threshold: number | null;
  /** Devis déjà soumis, pour ne pas proposer l'aval deux fois. */
  pendingQuoteIds: string[];
}

export function QuoteComparator({
  requestId,
  items,
  currency,
  isDecidable,
  approval,
}: {
  requestId: string;
  items: Item[];
  currency: CurrencyCode;
  isDecidable: boolean;
  approval?: ApprovalRules;
}) {
  return (
    <div className="space-y-6">
      {items.map((item) => (
        <ItemBlock
          key={item.id}
          requestId={requestId}
          item={item}
          currency={currency}
          isDecidable={isDecidable}
          approval={approval}
        />
      ))}
    </div>
  );
}

function ItemBlock({
  requestId,
  item,
  currency,
  isDecidable,
  approval,
}: {
  requestId: string;
  item: Item;
  currency: CurrencyCode;
  isDecidable: boolean;
  approval?: ApprovalRules;
}) {
  // Les brouillons des prestataires ne sont pas remontés par la base ; on
  // écarte ici ce qui n'est plus en lice pour ne comparer que le comparable.
  const live = item.quotes.filter((quote) => quote.status !== "withdrawn");
  const sorted = [...live].sort((a, b) => a.subtotal - b.subtotal);
  const cheapest = sorted.find((quote) => quote.status !== "declined")?.id;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-slate-900">{item.categories?.name ?? "Prestation"}</h2>
          {item.budget_max != null ? (
            <p className="mt-0.5 text-sm text-slate-500">
              Votre budget : {format(money(item.budget_max, currency))}
            </p>
          ) : null}
        </div>
        <p className="text-sm text-slate-500">
          {live.length === 0
            ? "Aucune offre reçue"
            : `${live.length} offre${live.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {item.awarded_quote_id ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">
          <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
          Vous avez retenu une offre pour cette prestation.
        </p>
      ) : null}

      {live.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Les prestataires de cette catégorie ont reçu votre demande. Leurs offres
          apparaîtront ici.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((quote) => (
            <QuoteCard
              key={quote.id}
              requestId={requestId}
              quote={quote}
              isCheapest={quote.id === cheapest && sorted.length > 1}
              isAwarded={quote.id === item.awarded_quote_id}
              overBudget={item.budget_max != null && quote.subtotal > item.budget_max}
              // On ne décide plus dès qu'un choix est fait pour ce besoin.
              isDecidable={isDecidable && !item.awarded_quote_id}
              needsApproval={
                approval?.threshold != null && quote.subtotal > approval.threshold
              }
              approvalPending={approval?.pendingQuoteIds.includes(quote.id) ?? false}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuoteCard({
  requestId,
  quote,
  isCheapest,
  isAwarded,
  overBudget,
  isDecidable,
  needsApproval,
  approvalPending,
}: {
  requestId: string;
  quote: Quote;
  isCheapest: boolean;
  isAwarded: boolean;
  overBudget: boolean;
  isDecidable: boolean;
  needsApproval: boolean;
  approvalPending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);

  const [acceptState, acceptAction, accepting] = React.useActionState<ProjectState, FormData>(
    acceptQuote,
    {},
  );
  const [declineState, declineAction, decliningPending] = React.useActionState<
    ProjectState,
    FormData
  >(declineQuote, {});
  const [approvalState, approvalAction, requesting] = React.useActionState<CompanyState, FormData>(
    requestQuoteApproval,
    {},
  );

  const currency = (quote.currency ?? "XOF") as CurrencyCode;
  const partner = quote.organizations?.brand_name ?? quote.organizations?.legal_name ?? "Prestataire";
  const status = quote.status as QuoteStatus;

  return (
    <li
      className={`rounded-2xl border p-4 transition-all duration-300 ${
        isAwarded
          ? "border-teal-200 bg-teal-50/40"
          : status === "declined"
            ? "border-slate-100 bg-slate-50/60"
            : "border-slate-200 bg-white hover:border-orange-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-slate-900">{partner}</p>
            {isAwarded ? (
              <Tag tone="teal">Votre choix</Tag>
            ) : status === "declined" ? (
              <Tag tone="slate">Écarté</Tag>
            ) : isCheapest ? (
              <Tag tone="orange">Le moins cher</Tag>
            ) : null}
            {overBudget && !isAwarded && status !== "declined" ? (
              <Tag tone="amber">Au-dessus de votre budget</Tag>
            ) : null}
          </div>

          <p className="mt-0.5 text-sm text-slate-500">
            {quote.organizations?.city ?? "—"} · {QUOTE_STATUS_LABELS_CLIENT[status]}
            {quote.valid_until
              ? ` · valable jusqu'au ${new Date(quote.valid_until).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
        </div>

        <p className="shrink-0 text-lg font-bold text-slate-900 tabular-nums">
          {format(money(quote.subtotal, currency))}
        </p>
      </div>

      {quote.message ? (
        <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {quote.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-orange-600 transition-all duration-200 hover:underline"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        {open ? "Masquer le détail" : `Voir le détail (${quote.quote_lines.length} ligne${quote.quote_lines.length > 1 ? "s" : ""})`}
      </button>

      {open ? (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2">
          {[...quote.quote_lines]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((line) => (
              <li key={line.id} className="flex justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-700">{line.label}</p>
                  <p className="text-xs text-slate-400">
                    {line.quantity} × {format(money(line.unit_price, currency))}{" "}
                    {UNIT_LABELS[line.unit as PriceUnit] ?? ""}
                  </p>
                  {line.description ? (
                    <p className="mt-0.5 text-xs text-slate-500">{line.description}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-medium text-slate-900 tabular-nums">
                  {format(money(line.line_total ?? line.quantity * line.unit_price, currency))}
                </p>
              </li>
            ))}
        </ul>
      ) : null}

      {status === "declined" && quote.decline_reason ? (
        <p className="mt-3 text-xs text-slate-500">
          <span className="font-bold">Motif : </span>
          {quote.decline_reason}
        </p>
      ) : null}

      {isDecidable && status === "sent" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {/* Au-dessus du seuil, on ne propose pas un bouton que la base
              refusera : on propose le geste qui, lui, aboutit. */}
          {approvalPending ? (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ShieldQuestion className="h-4 w-4 shrink-0" aria-hidden />
              Aval demandé — un valideur de votre entreprise doit se prononcer.
            </p>
          ) : needsApproval ? (
            <form action={approvalAction}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <Button type="submit" size="sm" disabled={requesting}>
                {requesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
                )}
                Demander l&apos;aval
              </Button>
            </form>
          ) : (
            <form action={acceptAction}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="requestId" value={requestId} />
              <Button type="submit" size="sm" disabled={accepting}>
                {accepting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                )}
                Retenir cette offre
              </Button>
            </form>
          )}

          {declining ? null : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDeclining(true)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Écarter
            </Button>
          )}
        </div>
      ) : null}

      {declining ? (
        <form action={declineAction} className="mt-3 space-y-2">
          <input type="hidden" name="quoteId" value={quote.id} />
          <input type="hidden" name="requestId" value={requestId} />
          <Textarea
            name="reason"
            rows={2}
            placeholder="Pourquoi cette offre ne convient pas ? Une phrase suffit, et elle aide le prestataire."
          />
          {declineState.errors?.reason ? (
            <p role="alert" className="text-xs text-red-600">
              {declineState.errors.reason}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={decliningPending}>
              Envoyer et écarter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {acceptState.message || declineState.message || approvalState.message ? (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            acceptState.ok || declineState.ok || approvalState.ok
              ? "bg-teal-50 text-teal-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {acceptState.message ?? declineState.message ?? approvalState.message}
        </p>
      ) : null}
    </li>
  );
}

const TAG_TONES = {
  teal: "bg-teal-100 text-teal-800",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-500",
} as const;

function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TAG_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
