"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Le référentiel — catégories et villes — sous une seule forme.
 *
 * Les deux écrans font le même travail : lister, créer, renommer, désactiver.
 * Les différences tiennent en deux champs (le type d'une catégorie, le
 * département d'une ville) et en une phrase d'avertissement. Deux composants
 * jumeaux auraient divergé à la première retouche.
 *
 * **On ne supprime jamais, on désactive.** Une catégorie est référencée par
 * les annonces avec `on delete restrict` ; une ville l'est par son nom. Dans
 * les deux cas la suppression est soit refusée, soit destructrice en silence.
 * Désactiver retire des écrans sans rien casser, et se défait.
 *
 * ⚠️ **Les Server Actions reçues en propriété sont l'exception à la règle §6**
 * du guide, pas un oubli. Cette règle interdit qu'une fonction traverse la
 * frontière serveur → client parce que la sérialisation RSC échoue à
 * l'exécution — c'est ce qui a rendu les trois back-offices en 500. Une
 * fonction `"use server"` n'est justement pas sérialisée : le client n'en
 * reçoit qu'une référence, et Next documente explicitement ce passage
 * (« Passing actions as props »). D'où le suffixe `Action` sur ces trois
 * propriétés, qui est la convention par laquelle le compilateur les reconnaît.
 * Un composant d'icône ou un `onChange`, eux, resteraient interdits.
 */

export interface ReferenceItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  listingCount: number;
  /** Type d'une catégorie, département d'une ville. Affiché tel quel. */
  meta?: string | null;
}

interface ActionState {
  message?: string;
  error?: string;
}

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface Props {
  items: ReferenceItem[];
  createAction: Action;
  renameAction: Action;
  toggleAction: Action;
  /** Champ supplémentaire du formulaire de création. */
  extraField: { name: string; label: string; options?: { value: string; label: string }[] };
  addLabel: string;
  /** Ce que renommer implique réellement. Dit avant, pas après. */
  renameWarning: string;
}

export function ReferenceManager({
  items,
  createAction,
  renameAction,
  toggleAction,
  extraField,
  addLabel,
  renameWarning,
}: Props) {
  return (
    <div className="space-y-6">
      <CreateForm action={createAction} extraField={extraField} addLabel={addLabel} />

      <ul className="space-y-2">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            renameAction={renameAction}
            toggleAction={toggleAction}
            renameWarning={renameWarning}
          />
        ))}
      </ul>
    </div>
  );
}

function CreateForm({
  action,
  extraField,
  addLabel,
}: {
  action: Action;
  extraField: Props["extraField"];
  addLabel: string;
}) {
  const [state, formAction, pending] = React.useActionState<ActionState, FormData>(action, {});
  const [ouvert, setOuvert] = React.useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" onClick={() => setOuvert(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden />
        {addLabel}
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input name="name" placeholder="Nom" required className="flex-1" />

        {extraField.options ? (
          <Select name={extraField.name} aria-label={extraField.label} className="sm:w-48">
            {extraField.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input name={extraField.name} placeholder={extraField.label} className="sm:w-48" />
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Créer"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ItemRow({
  item,
  renameAction,
  toggleAction,
  renameWarning,
}: {
  item: ReferenceItem;
  renameAction: Action;
  toggleAction: Action;
  renameWarning: string;
}) {
  const [rename, renommer, renommant] = React.useActionState<ActionState, FormData>(
    renameAction,
    {},
  );
  const [toggle, basculer, basculant] = React.useActionState<ActionState, FormData>(
    toggleAction,
    {},
  );
  const [edition, setEdition] = React.useState(false);

  const etat = rename.error ?? toggle.error ?? rename.message ?? toggle.message;
  const enErreur = Boolean(rename.error ?? toggle.error);

  return (
    <li
      className={`rounded-2xl border p-3 transition-all duration-300 ${
        item.isActive ? "border-slate-100 bg-white" : "border-slate-100 bg-slate-50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {edition ? (
          <form action={renommer} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <Input
              name="name"
              defaultValue={item.name}
              required
              className="h-9 min-w-0 flex-1 text-sm"
              aria-label={`Nouveau nom pour ${item.name}`}
            />
            <Button type="submit" disabled={renommant} className="h-9 px-3 text-xs">
              {renommant ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                "Enregistrer"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEdition(false)}
              className="h-9 px-3 text-xs"
            >
              Annuler
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="truncate">{item.name}</span>
                {!item.isActive ? (
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Masquée
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                <span className="font-mono">{item.slug}</span>
                {item.meta ? <span>{item.meta}</span> : null}
                <span>
                  {item.listingCount} annonce{item.listingCount > 1 ? "s" : ""}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEdition(true)}
                className="h-9 px-3 text-xs"
              >
                Renommer
              </Button>

              <form action={basculer}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="active" value={String(!item.isActive)} />
                <Button
                  type="submit"
                  variant="ghost"
                  disabled={basculant}
                  className="h-9 px-3 text-xs"
                >
                  {basculant ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : item.isActive ? (
                    "Masquer"
                  ) : (
                    "Afficher"
                  )}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {edition ? (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{renameWarning}</p>
      ) : null}

      {etat ? (
        <p
          role={enErreur ? "alert" : "status"}
          className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
            enErreur ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-900"
          }`}
        >
          {enErreur ? null : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
          {etat}
        </p>
      ) : null}
    </li>
  );
}
