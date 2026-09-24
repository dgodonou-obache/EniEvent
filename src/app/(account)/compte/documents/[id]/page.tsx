import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { requireSpace } from "@/lib/auth/session";
import { ENTITY } from "@/lib/legal";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getReceipt } from "@/lib/receipts";

/**
 * Un reçu, mis en forme pour être imprimé ou enregistré en PDF.
 *
 * ⚠️ **Ce n'est pas une facture, et le document le dit lui-même** — pas
 * seulement la page qui y mène. Quelqu'un qui enregistre ce PDF et le présente
 * à son comptable ne doit pas avoir à se souvenir d'une phrase lue ailleurs.
 *
 * ⚠️ **Aucune mention légale inventée.** `src/lib/legal.ts` porte encore des
 * valeurs à `null` : on affiche ce qui existe, et rien d'autre. Un RCCM
 * fabriqué sur un document financier n'est pas une approximation, c'est un
 * faux.
 *
 * **La commission n'y figure pas** : le client paie le prix affiché, la part
 * de la plateforme est prélevée sur celle du partenaire et ne le regarde pas
 * (guide §1).
 */

export const metadata = { title: "Reçu" };

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function jour(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "—" : JOUR.format(d);
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSpace("account");

  const { id } = await params;
  const receipt = await getReceipt(id);

  // La RLS a déjà fait le tri : un reçu qui n'est pas le sien est introuvable,
  // pas interdit. La distinction compte — « interdit » confirmerait qu'il existe.
  if (!receipt) notFound();

  const devise = receipt.currency as CurrencyCode;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Masqué à l'impression : personne ne veut de boutons sur son reçu. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/compte/documents"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:text-orange-600"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Tous mes documents
        </Link>

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Utilisez l&apos;impression de votre navigateur pour l&apos;enregistrer en PDF.
        </p>
      </div>

      <article className="rounded-2xl border border-slate-100 bg-white p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">
              <span className="text-orange-500">Éni</span>Event
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {ENTITY.legalName}
              <br />
              {ENTITY.city}, {ENTITY.country}
              <br />
              {ENTITY.email}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Reçu de paiement
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">{receipt.reference}</p>
            <p className="mt-1 text-xs text-slate-500">{jour(receipt.paidAt)}</p>
          </div>
        </header>

        <div className="border-b border-slate-100 py-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Prestation réglée
          </p>
          <p className="mt-1.5 font-bold text-slate-900">
            {receipt.listingTitle ?? "Prestation événementielle"}
          </p>

          <dl className="mt-3 space-y-1.5 text-sm">
            {receipt.partnerName ? (
              <Ligne label="Prestataire" value={receipt.partnerName} />
            ) : null}
            {receipt.orderReference ? (
              <Ligne label="Réservation" value={receipt.orderReference} />
            ) : null}
            {receipt.instalmentLabel ? (
              <Ligne label="Échéance" value={receipt.instalmentLabel} />
            ) : null}
            {receipt.eventDate ? (
              <Ligne label="Date de l'événement" value={jour(receipt.eventDate)} />
            ) : null}
          </dl>
        </div>

        <div className="flex items-baseline justify-between gap-4 py-6">
          <p className="font-bold text-slate-900">Montant réglé</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {format(money(receipt.amount, devise))}
          </p>
        </div>

        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 print:bg-white print:px-0">
          <strong>Ce document est un reçu, non une facture.</strong> Il atteste du règlement de la
          somme indiquée. Il ne constitue pas une pièce fiscale et ne comporte aucune mention de
          TVA. Le prix réglé est celui affiché par le prestataire : ÉniEvent ne facture aucun frais
          au client.
        </p>
      </article>
    </div>
  );
}

function Ligne({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
