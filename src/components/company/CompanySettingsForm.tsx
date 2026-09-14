"use client";

import * as React from "react";
import { CheckCircle2, Info, Loader2 } from "lucide-react";

import {
  saveCompanyProfile,
  saveCompanySettings,
  type CompanyState,
} from "@/app/(company)/entreprise/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, money } from "@/lib/money";
import { PHONE_PLACEHOLDER } from "@/lib/validation/phone";

/**
 * Fiche de l'entreprise et circuit de validation.
 *
 * Deux formulaires distincts et non un seul : ils n'ont ni le même public — la
 * fiche relève de l'administration, le seuil de la finance — ni la même
 * fréquence de modification. Les fusionner ferait ressaisir l'IFU pour changer
 * un montant.
 */

interface Profile {
  legal_name: string;
  brand_name: string | null;
  city: string | null;
  phone: string | null;
  billing_email: string | null;
  address: string | null;
  rccm: string | null;
  ifu: string | null;
}

interface Settings {
  approval_threshold: number | null;
  approve_publication: boolean | null;
}

export function CompanySettingsForm({
  profile,
  settings,
  cities,
  canManage,
}: {
  profile: Profile;
  settings: Settings | null;
  cities: { slug: string; name: string }[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <ProfileSection profile={profile} cities={cities} canManage={canManage} />
      <ApprovalSection settings={settings} canManage={canManage} />
    </div>
  );
}

function ProfileSection({
  profile,
  cities,
  canManage,
}: {
  profile: Profile;
  cities: { slug: string; name: string }[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<CompanyState, FormData>(
    saveCompanyProfile,
    {},
  );

  return (
    <form action={formAction} className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <h2 className="font-bold text-slate-900">Fiche entreprise</h2>
      <p className="mt-1 text-sm text-slate-500">
        Ce que les prestataires voient, et ce qui figurera sur vos factures.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="legalName">Raison sociale</Label>
          <Input
            id="legalName"
            name="legalName"
            defaultValue={profile.legal_name}
            disabled={!canManage}
            required
          />
          <FieldError message={state.errors?.legalName} />
        </div>

        <div>
          <Label htmlFor="brandName">Nom commercial</Label>
          <Input
            id="brandName"
            name="brandName"
            defaultValue={profile.brand_name ?? ""}
            disabled={!canManage}
          />
        </div>

        <div>
          <Label htmlFor="city">Ville</Label>
          <Select
            id="city"
            name="city"
            defaultValue={profile.city ?? "Cotonou"}
            disabled={!canManage}
          >
            {cities.map((city) => (
              <option key={city.slug} value={city.name}>
                {city.name}
              </option>
            ))}
          </Select>
          <FieldError message={state.errors?.city} />
        </div>

        <div>
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={profile.phone ?? ""}
            placeholder={PHONE_PLACEHOLDER}
            disabled={!canManage}
          />
          <FieldError message={state.errors?.phone} />
        </div>

        <div>
          <Label htmlFor="rccm">RCCM</Label>
          <Input id="rccm" name="rccm" defaultValue={profile.rccm ?? ""} disabled={!canManage} />
          <p className="mt-1 text-xs text-slate-400">Registre du commerce.</p>
        </div>

        <div>
          <Label htmlFor="ifu">IFU</Label>
          <Input id="ifu" name="ifu" defaultValue={profile.ifu ?? ""} disabled={!canManage} />
          <p className="mt-1 text-xs text-slate-400">Identifiant fiscal unique.</p>
        </div>

        <div>
          <Label htmlFor="billingEmail">E-mail de facturation</Label>
          <Input
            id="billingEmail"
            name="billingEmail"
            defaultValue={profile.billing_email ?? ""}
            disabled={!canManage}
          />
          <FieldError message={state.errors?.billingEmail} />
        </div>

        <div>
          <Label htmlFor="address">Adresse de facturation</Label>
          <Textarea
            id="address"
            name="address"
            rows={2}
            defaultValue={profile.address ?? ""}
            disabled={!canManage}
          />
        </div>
      </div>

      {canManage ? (
        <Button type="submit" className="mt-5" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Enregistrer la fiche
        </Button>
      ) : null}

      <Feedback state={state} />
    </form>
  );
}

function ApprovalSection({
  settings,
  canManage,
}: {
  settings: Settings | null;
  canManage: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<CompanyState, FormData>(
    saveCompanySettings,
    {},
  );

  const [threshold, setThreshold] = React.useState(
    settings?.approval_threshold != null ? String(settings.approval_threshold) : "",
  );

  const parsed = Number(threshold.replace(/\s/g, ""));
  const preview = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return (
    <form action={formAction} className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <h2 className="font-bold text-slate-900">Circuit de validation</h2>
      <p className="mt-1 text-sm text-slate-500">
        Au-delà du seuil, retenir une offre demande l&apos;aval d&apos;un valideur. C&apos;est
        la base contrôle qui l&apos;impose, pas seulement cet écran.
      </p>

      <div className="mt-5 space-y-4">
        <div className="sm:max-w-sm">
          <Label htmlFor="approvalThreshold">Seuil de validation (FCFA)</Label>
          <Input
            id="approvalThreshold"
            name="approvalThreshold"
            inputMode="numeric"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder="Laisser vide pour ne rien contrôler"
            disabled={!canManage}
          />
          <FieldError message={state.errors?.approvalThreshold} />
          <p className="mt-1.5 text-xs text-slate-400">
            {preview
              ? `Toute offre au-dessus de ${format(money(preview))} demandera un aval.`
              : "Aucun contrôle : chaque organisateur engage seul l'entreprise."}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="approvePublication"
            defaultChecked={settings?.approve_publication ?? false}
            disabled={!canManage}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
          />
          <span>
            <span className="font-medium">
              Valider aussi la publication des appels d&apos;offres
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Publier engage l&apos;image de l&apos;entreprise autant que son budget. Certaines
              veulent le relire avant, d&apos;autres jugent que cela ralentit trop.
            </span>
          </span>
        </label>
      </div>

      {canManage ? (
        <Button type="submit" className="mt-5" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Enregistrer le circuit
        </Button>
      ) : (
        <p className="mt-5 text-sm text-slate-500">
          Seuls le propriétaire, un administrateur ou la finance peuvent modifier ces réglages.
        </p>
      )}

      <Feedback state={state} />
    </form>
  );
}

function Feedback({ state }: { state: CompanyState }) {
  if (!state.message) return null;

  return (
    <p
      role="status"
      className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
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
