"use client";

import * as React from "react";
import { BadgeCheck, Check, Loader2 } from "lucide-react";

import {
  setCommissionRate,
  setDefaultCommissionRate,
  type CommissionState,
} from "@/app/(admin)/admin/(dashboard)/partenaires/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommissionRow, CommissionSettings } from "@/lib/admin";

/**
 * Réglage des commissions, partenaire par partenaire.
 *
 * **Un taux propre et un taux hérité ne se ressemblent pas, et l'écran le
 * dit.** « 10 % » affiché seul se lirait comme une décision prise sur ce
 * partenaire, alors qu'il peut venir du barème général : changer celui-ci le
 * déplacerait sans qu'on s'y attende. La case « barème général » porte donc la
 * distinction, et le taux hérité s'affiche en gris à côté.
 *
 * **Vider le champ ne vaut pas zéro.** Un taux de zéro est une décision — le
 * partenaire ne paie rien ; suivre le barème général en est une autre. Les
 * confondre ferait travailler la plateforme gratuitement sur une hésitation de
 * saisie, d'où la case plutôt qu'un champ vide interprété.
 */

const STATUTS: Record<CommissionRow["status"], string> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Suspendu",
};

export function CommissionTable({ settings }: { settings: CommissionSettings }) {
  return (
    <div className="space-y-6">
      <DefaultRate rate={settings.defaultRate} />

      {settings.partners.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Aucun partenaire inscrit pour l&apos;instant.
        </p>
      ) : (
        <ul className="space-y-3">
          {settings.partners.map((p) => (
            <PartnerRow key={p.orgId} partner={p} defaultRate={settings.defaultRate} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DefaultRate({ rate }: { rate: number }) {
  const [state, action, pending] = React.useActionState<CommissionState, FormData>(
    setDefaultCommissionRate,
    {},
  );

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4">
      <h2 className="text-base font-bold text-slate-900">Barème général</h2>
      <p className="mt-1 text-sm text-slate-500">
        Appliqué à tout partenaire qui n&apos;a pas de taux propre, y compris aux prochains
        inscrits.
      </p>

      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="w-32">
          <span className="mb-1 block text-xs font-medium text-slate-500">Taux</span>
          <div className="relative">
            <Input
              name="rate"
              inputMode="decimal"
              defaultValue={String(rate).replace(".", ",")}
              className="pr-8"
              aria-label="Taux de commission général, en pourcentage"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              %
            </span>
          </div>
        </label>

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Enregistrer
        </Button>
      </form>

      {/* Ce qui est déjà vendu ne bouge pas : `orders.commission_rate` est
          recopié à la création de la commande. Le dire évite qu'on croie
          rattraper une marge sur les réservations en cours. */}
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Un changement n&apos;engage que l&apos;avenir : les réservations déjà passées gardent
        le taux en vigueur le jour où elles ont été créées.
      </p>

      {state.message ? (
        <Retour ok={state.ok} message={state.message} />
      ) : null}
    </section>
  );
}

function PartnerRow({ partner, defaultRate }: { partner: CommissionRow; defaultRate: number }) {
  const [state, action, pending] = React.useActionState<CommissionState, FormData>(
    setCommissionRate,
    {},
  );

  const [auBareme, setAuBareme] = React.useState(partner.override === null);

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bold text-slate-900">
            <span className="truncate">{partner.orgName}</span>
            {partner.isVerified ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-teal-600" aria-label="Vérifié" />
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {partner.city ?? "Ville non renseignée"} · {STATUTS[partner.status]} ·{" "}
            {partner.listingsCount} annonce{partner.listingsCount > 1 ? "s" : ""}
          </p>
        </div>

        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="orgId" value={partner.orgId} />

          <label className="w-28">
            <span className="mb-1 block text-xs font-medium text-slate-500">Commission</span>
            <div className="relative">
              <Input
                name="rate"
                inputMode="decimal"
                disabled={auBareme}
                defaultValue={
                  partner.override === null ? "" : String(partner.override).replace(".", ",")
                }
                placeholder={String(defaultRate).replace(".", ",")}
                className="pr-8"
                aria-label={`Taux de commission de ${partner.orgName}, en pourcentage`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                %
              </span>
            </div>
          </label>

          <label className="flex h-11 items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              name="useDefault"
              checked={auBareme}
              onChange={(e) => setAuBareme(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
            />
            Barème général
          </label>

          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
        </form>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {partner.override === null
          ? `Suit le barème général — ${fmt(partner.effective)} % s'appliquent à sa prochaine réservation.`
          : `Taux propre : ${fmt(partner.effective)} % s'appliquent à sa prochaine réservation.`}
      </p>

      {state.message && state.orgId === partner.orgId ? (
        <Retour ok={state.ok} message={state.message} />
      ) : null}
    </li>
  );
}

/** « 12.5 » se lit « 12,5 » ici, et « 10.00 » se lit « 10 ». */
function fmt(rate: number): string {
  return String(Number(rate)).replace(".", ",");
}

function Retour({ ok, message }: { ok?: boolean; message: string }) {
  return (
    <p
      role="status"
      className={`mt-2 flex items-center gap-1.5 text-xs ${ok ? "text-teal-700" : "text-slate-700"}`}
    >
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
      {message}
    </p>
  );
}
