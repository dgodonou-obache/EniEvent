"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Eye, Loader2, Send } from "lucide-react";

import {
  setPricingRule,
  submitForReview,
  togglePause,
  updateListing,
  updateListingCapacity,
  type ActionState,
} from "@/app/(partner)/pro/(dashboard)/annonces/actions";
import { ListingStatusBadge } from "@/components/dashboard/ListingStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PartnerListingDetail } from "@/lib/partner";
import { UNIT_OPTIONS } from "@/lib/units";

interface Option {
  id: string;
  slug: string;
  name: string;
}

interface ListingEditorProps {
  listing: PartnerListingDetail;
  categoryGroups: { slug: string; name: string; kind: string; children: Option[] }[];
  cities: { slug: string; name: string }[];
  policies: { id: string; name: string; summary: string }[];
}


export function ListingEditor({ listing, categoryGroups, cities, policies }: ListingEditorProps) {
  const isVenue = listing.kind === "venue";
  const venue = listing.venue_details;
  const service = listing.service_details;
  const mainRule = listing.pricing_rules?.[0];

  // Seules les catégories de même nature sont proposées : changer un lieu en
  // service invaliderait ses capacités et sa clé étrangère composite.
  const compatibleGroups = categoryGroups.filter((g) => g.kind === listing.kind);

  return (
    <div className="space-y-6">
      <Section
        title="Informations"
        description="Ce que le client voit en premier."
        action={updateListing}
        listingId={listing.id}
      >
        {(state) => (
          <>
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input id="title" name="title" defaultValue={listing.title} required />
              <FieldError message={state.errors?.title} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="categoryId">Catégorie</Label>
                <Select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={listing.categories?.id ?? ""}
                >
                  {compatibleGroups.map((family) => (
                    <optgroup key={family.slug} label={family.name}>
                      {family.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <FieldError message={state.errors?.categoryId} />
              </div>

              <div>
                <Label htmlFor="bookingMode">Mode de réservation</Label>
                <Select
                  id="bookingMode"
                  name="bookingMode"
                  defaultValue={listing.booking_mode ?? "both"}
                >
                  <option value="instant">Réservation immédiate</option>
                  <option value="quote">Sur devis</option>
                  <option value="both">Les deux</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="city">Ville</Label>
                <Select id="city" name="city" defaultValue={listing.city}>
                  {cities.map((city) => (
                    <option key={city.slug} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="district">Quartier</Label>
                <Input
                  id="district"
                  name="district"
                  defaultValue={listing.district ?? ""}
                  placeholder="Haie Vive"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" name="address" defaultValue={listing.address ?? ""} />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={6}
                defaultValue={listing.description ?? ""}
                placeholder="Décrivez le lieu ou la prestation : ce qui est inclus, ce qui ne l'est pas, les contraintes utiles à connaître."
              />
              <FieldError message={state.errors?.description} />
              <p className="mt-1.5 text-xs text-slate-400">
                40 caractères minimum pour pouvoir soumettre l&apos;annonce.
              </p>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Conditions"
        description="Formulez-les en clair. Le client doit comprendre sans interpréter."
        action={updateListing}
        listingId={listing.id}
        // Les champs du bloc « Informations » sont renvoyés en caché : la même
        // action met tout à jour, on ne veut pas les écraser avec du vide.
        hidden={{
          title: listing.title,
          categoryId: listing.categories?.id ?? "",
          city: listing.city,
          district: listing.district ?? "",
          bookingMode: listing.booking_mode ?? "both",
          description: listing.description ?? "",
          address: listing.address ?? "",
        }}
      >
        {(state) => (
          <>
            <div>
              <Label htmlFor="paymentTerms">Conditions de paiement</Label>
              <Textarea
                id="paymentTerms"
                name="paymentTerms"
                rows={3}
                defaultValue={listing.payment_terms ?? ""}
                placeholder="Un acompte de 50 % bloque la date. Le solde est à régler 3 jours avant l'événement."
              />
            </div>

            <div>
              <Label htmlFor="cancellationPolicyId">Politique d&apos;annulation</Label>
              <Select
                id="cancellationPolicyId"
                name="cancellationPolicyId"
                defaultValue={listing.cancellation_policies?.id ?? ""}
              >
                <option value="">Aucune politique choisie</option>
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </Select>
              <ul className="mt-2 space-y-1.5">
                {policies.map((policy) => (
                  <li key={policy.id} className="text-xs text-slate-400">
                    <span className="font-medium text-slate-500">{policy.name}</span> —{" "}
                    {policy.summary}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="minPrice">Prix plancher (FCFA)</Label>
                <Input
                  id="minPrice"
                  name="minPrice"
                  type="number"
                  min={0}
                  defaultValue={listing.min_price ?? ""}
                  placeholder="150000"
                />
                <FieldError message={state.errors?.minPrice} />
                <p className="mt-1.5 text-xs text-slate-400">
                  Filet de sécurité : aucune date ne pourra être ouverte en dessous de ce
                  tarif. Protège des ventes à perte et des zéros oubliés.
                </p>
              </div>

              <div>
                <Label htmlFor="minNoticeDays">Délai de réservation (jours)</Label>
                <Input
                  id="minNoticeDays"
                  name="minNoticeDays"
                  type="number"
                  min={0}
                  defaultValue={listing.min_notice_days ?? 0}
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Combien de jours à l&apos;avance au minimum.
                </p>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Tarif principal"
        description="Le tarif de référence. Vous pourrez l'ajuster date par date dans le planning."
        action={setPricingRule}
        listingId={listing.id}
      >
        {(state) => (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="unit">Unité</Label>
              <Select id="unit" name="unit" defaultValue={mainRule?.unit ?? "day"}>
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="basePrice">Tarif (FCFA)</Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                min={0}
                defaultValue={mainRule?.base_price ?? ""}
                required
              />
              <FieldError message={state.errors?.basePrice} />
            </div>

            <div>
              <Label htmlFor="weekendMultiplier">Majoration week-end</Label>
              <Input
                id="weekendMultiplier"
                name="weekendMultiplier"
                type="number"
                min={1}
                max={5}
                // 0,01 et non 0,05 : un pas plus large ferait rejeter 1,33 par
                // le navigateur, alors que le serveur l'accepte.
                step={0.01}
                defaultValue={mainRule?.weekend_multiplier ?? 1}
              />
              <p className="mt-1.5 text-xs text-slate-400">1,3 = +30 % le samedi et le dimanche.</p>
            </div>
          </div>
        )}
      </Section>

      <Section
        title={isVenue ? "Capacités" : "Prestation"}
        description={
          isVenue
            ? "Combien de personnes votre lieu peut accueillir, selon la disposition."
            : "Le périmètre de votre prestation."
        }
        action={updateListingCapacity}
        listingId={listing.id}
        hidden={{ kind: listing.kind ?? "" }}
      >
        {(state) =>
          isVenue ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  id="capacitySeated"
                  label="Assis"
                  defaultValue={venue?.capacity_seated}
                />
                <NumberField
                  id="capacityStanding"
                  label="Debout"
                  defaultValue={venue?.capacity_standing}
                  error={state.errors?.capacityStanding}
                />
                <NumberField
                  id="capacityCocktail"
                  label="Cocktail"
                  defaultValue={venue?.capacity_cocktail}
                />
                <NumberField id="surfaceM2" label="Surface (m²)" defaultValue={venue?.surface_m2} />
                <NumberField
                  id="parkingSpots"
                  label="Places de parking"
                  defaultValue={venue?.parking_spots}
                />
                <NumberField
                  id="noiseCurfewHour"
                  label="Arrêt de la musique (heure)"
                  defaultValue={venue?.noise_curfew_hour}
                  max={23}
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <Checkbox
                  id="hasOutdoorSpace"
                  label="Espace extérieur"
                  defaultChecked={venue?.has_outdoor_space}
                />
                <Checkbox
                  id="hasKitchen"
                  label="Cuisine équipée"
                  defaultChecked={venue?.has_kitchen}
                />
                <Checkbox
                  id="accessibilityPmr"
                  label="Accès mobilité réduite"
                  defaultChecked={venue?.accessibility_pmr}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="minGuests" label="À partir de (invités)" defaultValue={service?.min_guests} />
              <NumberField
                id="maxGuests"
                label="Jusqu'à (invités)"
                defaultValue={service?.max_guests}
                error={state.errors?.maxGuests}
              />
              <NumberField
                id="travelRadiusKm"
                label="Rayon de déplacement (km)"
                defaultValue={service?.travel_radius_km}
              />
              <NumberField
                id="setupTimeMin"
                label="Temps d'installation (minutes)"
                defaultValue={service?.setup_time_min}
              />
            </div>
          )
        }
      </Section>

      <PublicationPanel listing={listing} />
    </div>
  );
}

// -----------------------------------------------------------------------------

function PublicationPanel({ listing }: { listing: PartnerListingDetail }) {
  const [submitState, submitAction, submitting] = React.useActionState<ActionState, FormData>(
    submitForReview,
    {},
  );
  const [pauseState, pauseAction, pausing] = React.useActionState<ActionState, FormData>(
    togglePause,
    {},
  );

  const isLive = listing.status === "approved";
  const publicHref = `/${listing.kind === "venue" ? "lieux" : "prestataires"}/${listing.slug}`;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Publication</h2>
          <p className="mt-1 text-sm text-slate-500">
            {listing.status === "draft"
              ? "Cette annonce n'est visible que par vous."
              : listing.status === "pending"
                ? "Nos équipes vérifient votre annonce, sous 48 h ouvrées."
                : listing.status === "rejected"
                  ? "Corrigez les points signalés, puis soumettez à nouveau."
                  : isLive && listing.is_paused
                    ? "Votre annonce est en pause : elle n'apparaît plus au catalogue."
                    : "Votre annonce est en ligne."}
          </p>
        </div>
        <ListingStatusBadge status={listing.status} isPaused={listing.is_paused} />
      </div>

      {listing.status === "rejected" && listing.moderation_notes ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-bold">Motif : </span>
          {listing.moderation_notes}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {listing.status === "draft" || listing.status === "rejected" ? (
          <form action={submitAction}>
            <input type="hidden" name="listingId" value={listing.id} />
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Soumettre à la validation
            </Button>
          </form>
        ) : null}

        {isLive ? (
          <>
            <Link href={publicHref} target="_blank">
              <Button variant="outline">
                <Eye className="h-4 w-4" aria-hidden />
                Voir en ligne
              </Button>
            </Link>

            <form action={pauseAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="paused" value={String(!listing.is_paused)} />
              <Button type="submit" variant="ghost" disabled={pausing}>
                {listing.is_paused ? "Remettre en ligne" : "Mettre en pause"}
              </Button>
            </form>
          </>
        ) : null}
      </div>

      <Feedback message={submitState.message ?? pauseState.message} />
    </section>
  );
}

interface SectionProps {
  title: string;
  description: string;
  listingId: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  children: (state: ActionState) => React.ReactNode;
}

function Section({ title, description, listingId, action, hidden, children }: SectionProps) {
  const [state, formAction, pending] = React.useActionState<ActionState, FormData>(action, {});

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="listingId" value={listingId} />
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        {children(state)}

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
          <Feedback message={state.message} />
        </div>
      </form>
    </section>
  );
}

function Feedback({ message }: { message?: string }) {
  if (!message) return null;

  const isError = /impossible|introuvable|ajoutez/i.test(message);

  return (
    <p
      role="status"
      className={
        isError
          ? "text-sm font-medium text-red-600"
          : "flex items-center gap-1.5 text-sm font-medium text-teal-700"
      }
    >
      {isError ? null : <CheckCircle2 className="h-4 w-4" aria-hidden />}
      {message}
    </p>
  );
}

function NumberField({
  id,
  label,
  defaultValue,
  max,
  error,
}: {
  id: string;
  label: string;
  defaultValue?: number | null;
  max?: number;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min={0}
        max={max}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
      />
      <FieldError message={error} />
    </div>
  );
}

function Checkbox({
  id,
  label,
  defaultChecked,
}: {
  id: string;
  label: string;
  defaultChecked?: boolean | null;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        id={id}
        name={id}
        type="checkbox"
        defaultChecked={defaultChecked ?? false}
        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
      />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}
