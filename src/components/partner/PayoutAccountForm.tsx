"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  savePayoutAccount,
  type PayoutAccountState,
} from "@/app/(partner)/pro/(dashboard)/parametres/payout-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PHONE_PLACEHOLDER } from "@/lib/validation/phone";

/**
 * Coordonnées de versement.
 *
 * L'avertissement sur le nom du titulaire n'est pas une précaution de façade :
 * un numéro Mobile Money mal recopié envoie l'argent chez un inconnu, et il ne
 * revient pas. Le dire au moment de la saisie est le seul instant où cela sert
 * à quelque chose.
 */

interface Props {
  orgId: string;
  initial: {
    method: string;
    phone: string;
    holderName: string;
    bankDetails: string;
    verified: boolean;
  } | null;
}

const MOYENS = [
  { value: "mtn", label: "MTN MoMo" },
  { value: "moov", label: "Moov Money" },
  { value: "celtiis", label: "Celtiis Cash" },
  { value: "virement", label: "Virement bancaire" },
];

export function PayoutAccountForm({ orgId, initial }: Props) {
  const [method, setMethod] = React.useState(initial?.method ?? "mtn");
  const [state, action, pending] = React.useActionState<PayoutAccountState, FormData>(
    savePayoutAccount,
    {},
  );

  const virement = method === "virement";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Moyen de versement</span>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {MOYENS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>

        {!virement ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Numéro du compte
            </span>
            <Input
              name="phone"
              defaultValue={initial?.phone ?? ""}
              placeholder={PHONE_PLACEHOLDER}
              inputMode="tel"
            />
          </label>
        ) : null}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Nom du titulaire, tel qu&apos;enregistré chez l&apos;opérateur
        </span>
        <Input
          name="holderName"
          defaultValue={initial?.holderName ?? ""}
          placeholder="Ex. Awa Hounkpatin"
        />
      </label>

      {virement ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Coordonnées bancaires (banque, IBAN ou numéro de compte)
          </span>
          <Input
            name="bankDetails"
            defaultValue={initial?.bankDetails ?? ""}
            placeholder="Ex. Ecobank Bénin — BJ066 0100 1234 5678 9012 3456"
          />
        </label>
      ) : null}

      <p className="flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <strong>Vérifiez ce numéro chiffre par chiffre.</strong> Un versement envoyé au
          mauvais compte ne peut pas être récupéré. Le nom du titulaire nous permet de
          contrôler avant d&apos;envoyer.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Enregistrement…
            </>
          ) : (
            "Enregistrer mes coordonnées"
          )}
        </Button>

        {state.message ? (
          <p role="status" className={`text-sm ${state.ok ? "text-teal-700" : "text-slate-700"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
