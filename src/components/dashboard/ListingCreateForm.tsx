"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { createListing, type ActionState } from "@/app/(partner)/pro/(dashboard)/annonces/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  slug: string;
  name: string;
}

interface ListingCreateFormProps {
  categoryGroups: { slug: string; name: string; kind: string; children: Option[] }[];
  cities: { slug: string; name: string }[];
}

const MODES = [
  {
    value: "instant",
    label: "Réservation immédiate",
    hint: "Le client réserve au prix affiché, sans échange préalable.",
  },
  {
    value: "quote",
    label: "Sur devis",
    hint: "Le client décrit son besoin, vous lui répondez par un devis.",
  },
  {
    value: "both",
    label: "Les deux",
    hint: "Le client choisit : réserver directement ou demander un devis.",
  },
];

export function ListingCreateForm({ categoryGroups, cities }: ListingCreateFormProps) {
  const [state, action, pending] = React.useActionState<ActionState, FormData>(createListing, {});
  const [mode, setMode] = React.useState("both");

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="title">Titre de l&apos;annonce</Label>
        <Input
          id="title"
          name="title"
          required
          placeholder="Salle Étoile — Haie Vive"
          aria-invalid={state.errors?.title ? true : undefined}
        />
        <FieldError message={state.errors?.title} />
        <p className="mt-1.5 text-xs text-slate-400">
          Ce que le client lira en premier. Soyez précis : le type de lieu ou de
          prestation, et le quartier si c&apos;est un atout.
        </p>
      </div>

      <div>
        <Label htmlFor="categoryId">Catégorie</Label>
        <Select
          id="categoryId"
          name="categoryId"
          required
          defaultValue=""
          aria-invalid={state.errors?.categoryId ? true : undefined}
        >
          <option value="" disabled>
            Choisir une catégorie
          </option>
          {categoryGroups.map((family) => (
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
        <p className="mt-1.5 text-xs text-slate-400">
          La catégorie détermine si votre annonce apparaît dans les lieux ou dans les
          prestataires. Elle ne pourra changer que vers une catégorie de même nature.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="city">Ville</Label>
          <Select
            id="city"
            name="city"
            required
            defaultValue=""
            aria-invalid={state.errors?.city ? true : undefined}
          >
            <option value="" disabled>
              Choisir une ville
            </option>
            {cities.map((city) => (
              <option key={city.slug} value={city.name}>
                {city.name}
              </option>
            ))}
          </Select>
          <FieldError message={state.errors?.city} />
        </div>

        <div>
          <Label htmlFor="district">Quartier (facultatif)</Label>
          <Input id="district" name="district" placeholder="Haie Vive" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-slate-900">
          Comment souhaitez-vous être réservé ?
        </legend>
        <input type="hidden" name="bookingMode" value={mode} />

        <div className="space-y-2">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={cn(
                "block w-full rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.99]",
                mode === option.value
                  ? "border-orange-200 bg-orange-50"
                  : "border-slate-200 hover:border-orange-200 hover:bg-orange-50",
              )}
            >
              <span
                className={cn(
                  "block font-medium",
                  mode === option.value ? "text-orange-700" : "text-slate-900",
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">{option.hint}</span>
            </button>
          ))}
        </div>
        <FieldError message={state.errors?.bookingMode} />
      </fieldset>

      {state.message ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? "Création…" : "Créer le brouillon"}
        </Button>
        <p className="text-xs text-slate-400">
          Rien n&apos;est publié à cette étape : vous compléterez l&apos;annonce ensuite.
        </p>
      </div>
    </form>
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
