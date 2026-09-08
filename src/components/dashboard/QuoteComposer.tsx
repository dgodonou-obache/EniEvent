"use client";

import * as React from "react";
import { CheckCircle2, Info, Loader2, Plus, Send, Trash2 } from "lucide-react";

import {
  addQuoteLine,
  removeQuoteLine,
  saveQuoteHeader,
  sendQuote,
  withdrawQuote,
  type QuoteState,
} from "@/app/(partner)/pro/(dashboard)/devis/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, money, type CurrencyCode } from "@/lib/money";
import { QUOTE_STATUS_LABELS_PARTNER, type QuoteStatus } from "@/lib/states";
import { UNIT_LABELS, UNIT_OPTIONS, type PriceUnit } from "@/lib/units";

/**
 * Rédaction d'une proposition, ligne par ligne.
 *
 * Le total n'est jamais saisi : il est recalculé en base à chaque mouvement de
 * ligne, et simplement affiché ici. Un devis dont le total ne correspond pas à
 * son détail est la première cause de litige — autant rendre l'écart
 * impossible plutôt que de le contrôler.
 *
 * Une fois envoyé, le devis se fige. Le client compare des montants : ils
 * doivent rester ceux qu'on lui a proposés.
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

interface QuoteComposerProps {
  quoteId: string;
  status: QuoteStatus;
  subtotal: number;
  currency: CurrencyCode;
  message: string | null;
  validUntil: string | null;
  listingId: string | null;
  declineReason: string | null;
  lines: Line[];
  listings: { id: string; title: string }[];
  budgetMax: number | null;
}

export function QuoteComposer({
  quoteId,
  status,
  subtotal,
  currency,
  message,
  validUntil,
  listingId,
  declineReason,
  lines,
  listings,
  budgetMax,
}: QuoteComposerProps) {
  const editable = status === "draft";

  const [headerState, headerAction, savingHeader] = React.useActionState<QuoteState, FormData>(
    saveQuoteHeader,
    {},
  );
  const [lineState, lineAction, addingLine] = React.useActionState<QuoteState, FormData>(
    addQuoteLine,
    {},
  );
  const [removeState, removeAction] = React.useActionState<QuoteState, FormData>(
    removeQuoteLine,
    {},
  );
  const [sendState, sendAction, sending] = React.useActionState<QuoteState, FormData>(
    sendQuote,
    {},
  );
  const [withdrawState, withdrawAction, withdrawing] = React.useActionState<QuoteState, FormData>(
    withdrawQuote,
    {},
  );

  const overBudget = budgetMax != null && subtotal > budgetMax;

  return (
    <div className="space-y-6">
      {status === "declined" && declineReason ? (
        <Note tone="danger">
          <span className="font-bold">Ce devis n&apos;a pas été retenu. </span>
          {declineReason}
        </Note>
      ) : null}

      {status === "accepted" ? (
        <Note tone="success">
          <span className="font-bold">Votre devis a été accepté.</span> Le client dispose de vos
          coordonnées ; le règlement en ligne arrivera avec la chaîne de paiement.
        </Note>
      ) : null}

      {/* Le détail chiffré */}
      <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <h2 className="font-bold text-slate-900">Détail de votre offre</h2>
        <p className="mt-1 text-sm text-slate-500">
          Décomposez votre prix. Un devis détaillé est retenu bien plus souvent qu&apos;un
          montant global sans explication.
        </p>

        {lines.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Aucune ligne pour l&apos;instant.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
            {lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{line.label}</p>
                  <p className="text-xs text-slate-500">
                    {line.quantity} × {format(money(line.unit_price, currency))}{" "}
                    {UNIT_LABELS[line.unit as PriceUnit] ?? ""}
                  </p>
                  {line.description ? (
                    <p className="mt-0.5 text-xs text-slate-400">{line.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <p className="font-bold text-slate-900 tabular-nums">
                    {format(money(line.line_total ?? line.quantity * line.unit_price, currency))}
                  </p>

                  {editable ? (
                    <form action={removeAction}>
                      <input type="hidden" name="quoteId" value={quoteId} />
                      <input type="hidden" name="lineId" value={line.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirer la ligne ${line.label}`}
                        className="h-9 w-9 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-baseline justify-between">
          <p className="font-bold text-slate-900">Total</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {format(money(subtotal, currency))}
          </p>
        </div>

        {overBudget ? (
          <p className="mt-2 text-sm text-amber-800">
            Votre total dépasse le budget annoncé par le client (
            {format(money(budgetMax, currency))}). C&apos;est possible, mais expliquez pourquoi
            dans votre message.
          </p>
        ) : null}

        <Feedback state={removeState} />

        {editable ? (
          <form action={lineAction} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
            <input type="hidden" name="quoteId" value={quoteId} />

            <p className="text-sm font-bold text-slate-900">Ajouter une ligne</p>

            <div>
              <Label htmlFor="label">Prestation</Label>
              <Input id="label" name="label" placeholder="Buffet 200 couverts" required />
              <FieldError message={lineState.errors?.label} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="quantity">Quantité</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  inputMode="numeric"
                  defaultValue="1"
                  required
                />
                <FieldError message={lineState.errors?.quantity} />
              </div>

              <div>
                <Label htmlFor="unit">Unité</Label>
                <Select id="unit" name="unit" defaultValue="forfait">
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="unitPrice">Prix unitaire (FCFA)</Label>
                <Input id="unitPrice" name="unitPrice" inputMode="numeric" required />
                <FieldError message={lineState.errors?.unitPrice} />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Précision</Label>
              <Input
                id="description"
                name="description"
                placeholder="Entrée, plat, dessert, service compris"
              />
            </div>

            <Button type="submit" variant="outline" size="sm" disabled={addingLine}>
              {addingLine ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              Ajouter
            </Button>

            <Feedback state={lineState} />
          </form>
        ) : null}
      </section>

      {/* Message et validité */}
      <form action={headerAction} className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <input type="hidden" name="quoteId" value={quoteId} />

        <h2 className="font-bold text-slate-900">Votre message</h2>
        <p className="mt-1 text-sm text-slate-500">
          C&apos;est ce que le client lit avant vos prix.
        </p>

        <div className="mt-4 space-y-4">
          <Textarea
            name="message"
            rows={5}
            defaultValue={message ?? ""}
            disabled={!editable}
            placeholder="Ce que vous proposez, ce qui vous distingue, vos conditions."
          />
          <FieldError message={headerState.errors?.message} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="validUntil">Offre valable jusqu&apos;au</Label>
              <Input
                id="validUntil"
                name="validUntil"
                placeholder="2026-10-15"
                defaultValue={validUntil ?? ""}
                disabled={!editable}
              />
              <FieldError message={headerState.errors?.validUntil} />
            </div>

            {listings.length > 0 ? (
              <div>
                <Label htmlFor="listingId">Annonce rattachée</Label>
                <Select
                  id="listingId"
                  name="listingId"
                  defaultValue={listingId ?? ""}
                  disabled={!editable}
                >
                  <option value="">Aucune</option>
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.title}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  Le client pourra consulter votre fiche et vos photos.
                </p>
              </div>
            ) : null}
          </div>

          {editable ? (
            <Button type="submit" variant="outline" size="sm" disabled={savingHeader}>
              {savingHeader ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Enregistrer
            </Button>
          ) : null}

          <Feedback state={headerState} />
        </div>
      </form>

      {/* Envoi */}
      <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Envoi</h2>
            <p className="mt-1 text-sm text-slate-500">
              {status === "draft"
                ? "Ce devis n'est visible que par vous. Le client ne le verra qu'une fois envoyé."
                : `État : ${QUOTE_STATUS_LABELS_PARTNER[status]}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {status === "draft" ? (
              <form action={sendAction}>
                <input type="hidden" name="quoteId" value={quoteId} />
                <Button type="submit" disabled={sending || subtotal <= 0}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  Envoyer au client
                </Button>
              </form>
            ) : null}

            {status === "sent" ? (
              <form action={withdrawAction}>
                <input type="hidden" name="quoteId" value={quoteId} />
                <Button type="submit" variant="ghost" disabled={withdrawing}>
                  Retirer mon devis
                </Button>
              </form>
            ) : null}
          </div>
        </div>

        {status === "draft" && subtotal <= 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Ajoutez au moins une ligne chiffrée avant d&apos;envoyer.
          </p>
        ) : null}

        <Feedback state={sendState} />
        <Feedback state={withdrawState} />
      </section>
    </div>
  );
}

function Feedback({ state }: { state: QuoteState }) {
  if (!state.message) return null;

  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
        state.ok ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-700"
      }`}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {state.message}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

function Note({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-2xl border p-4 text-sm ${
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-teal-200 bg-teal-50 text-teal-800"
      }`}
    >
      {children}
    </p>
  );
}
