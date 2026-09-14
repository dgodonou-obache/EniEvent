"use client";

import * as React from "react";
import { Check, Info, Loader2, Send } from "lucide-react";

import { submitBrief, type BriefState } from "@/app/(marketplace)/demande-de-devis/actions";
import { CustomDatePicker } from "@/components/shared/CustomDatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toKey } from "@/lib/calendar";
import { format, money } from "@/lib/money";
import { PHONE_PLACEHOLDER } from "@/lib/validation/phone";
import { EVENT_TYPES, RESPONSE_WINDOWS } from "@/lib/validation/quote";

/**
 * Le brief : décrit une fois, envoyé à tous les prestataires concernés.
 *
 * Un seul écran plutôt qu'un assistant en plusieurs étapes. Un assistant
 * rassure sur le papier, mais il masque la longueur réelle du formulaire et
 * empêche de revenir corriger une réponse sans tout refaire. Ici, tout est
 * visible, et le champ le plus déterminant — les prestations recherchées —
 * arrive en premier : c'est lui qui décide de qui recevra la demande.
 */

interface Family {
  slug: string;
  name: string;
  kind: string;
  children: { id: string; slug: string; name: string }[];
}

interface BriefFormProps {
  families: Family[];
  cities: { slug: string; name: string }[];
  /** Présélection quand la demande part d'une fiche annonce. */
  preselectedCategoryId?: string;
  preselectedCity?: string;
  /** Entreprise uniquement : rattache la dépense à une enveloppe. */
  costCenters?: { id: string; code: string; name: string }[];
}

export function BriefForm({
  families,
  cities,
  preselectedCategoryId,
  preselectedCity,
  costCenters = [],
}: BriefFormProps) {
  const [state, formAction, pending] = React.useActionState<BriefState, FormData>(
    submitBrief,
    {},
  );

  const [selected, setSelected] = React.useState<string[]>(
    preselectedCategoryId ? [preselectedCategoryId] : [],
  );
  const [eventDate, setEventDate] = React.useState<Date | undefined>();
  const [flexible, setFlexible] = React.useState(false);
  const [globalBudget, setGlobalBudget] = React.useState("");
  const [budgets, setBudgets] = React.useState<Record<string, string>>({});

  const byId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const family of families) {
      for (const child of family.children) map.set(child.id, child.name);
    }
    return map;
  }, [families]);

  function toggleCategory(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const allocated = selected.reduce((total, id) => total + toAmount(budgets[id]), 0);
  const globalAmount = toAmount(globalBudget);
  const overAllocated = globalAmount > 0 && allocated > globalAmount;

  return (
    <form action={formAction} className="space-y-6">
      {selected.map((id) => (
        <input key={id} type="hidden" name="categoryIds" value={id} />
      ))}
      <input type="hidden" name="eventDate" value={eventDate ? toKey(eventDate) : ""} />

      <Section
        title="De quoi avez-vous besoin ?"
        description="Chaque prestation choisie part en appel d'offres auprès des prestataires de la catégorie. Vous recevrez un devis par prestataire, et vous comparerez."
      >
        <div className="space-y-5">
          {families.map((family) => (
            <div key={family.slug}>
              <p className="micro-label mb-2 text-slate-400">{family.name}</p>
              <div className="flex flex-wrap gap-2">
                {family.children.map((child) => {
                  const active = selected.includes(child.id);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => toggleCategory(child.id)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                        active
                          ? "border-orange-200 bg-orange-50 text-orange-600"
                          : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                      {child.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <FieldError message={state.errors?.categoryIds} />

        {selected.length > 0 ? (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="font-bold text-slate-900">
              Votre budget pour chacune{" "}
              <span className="font-medium text-slate-400">— facultatif</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Un montant global ne dit rien à un traiteur : il ne sait pas quelle part
              lui revient. Indiquer une enveloppe par prestation évite les devis hors
              sujet — et vous pouvez en laisser vides.
            </p>

            <ul className="mt-4 space-y-2">
              {selected.map((id) => (
                <li key={id} className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor={`budget-${id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                  >
                    {byId.get(id) ?? "Prestation"}
                  </label>
                  <Input
                    id={`budget-${id}`}
                    name={`budget-${id}`}
                    inputMode="numeric"
                    placeholder="FCFA"
                    value={budgets[id] ?? ""}
                    onChange={(event) =>
                      setBudgets((current) => ({ ...current, [id]: event.target.value }))
                    }
                    className="w-40 shrink-0"
                  />
                </li>
              ))}
            </ul>

            <FieldError message={state.errors?.categoryBudgets} />

            {allocated > 0 ? (
              <p
                className={`mt-3 text-sm ${overAllocated ? "text-amber-800" : "text-slate-500"}`}
              >
                Réparti : <span className="font-bold">{formatAmount(allocated)}</span>
                {globalAmount > 0 ? (
                  overAllocated ? (
                    <> — soit {formatAmount(allocated - globalAmount)} de plus que votre
                    budget global. Ce n&apos;est pas bloquant, mais vérifiez.</>
                  ) : (
                    <> sur {formatAmount(globalAmount)}, il vous reste{" "}
                    {formatAmount(globalAmount - allocated)}.</>
                  )
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Votre événement" description="Ce que les prestataires liront en premier.">
        <div>
          <Label htmlFor="title">En une phrase</Label>
          <Input
            id="title"
            name="title"
            placeholder="Mariage de 200 personnes à Cotonou"
            required
          />
          <FieldError message={state.errors?.title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="eventType">Type d&apos;événement</Label>
            <Select id="eventType" name="eventType" defaultValue="mariage">
              {EVENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="guests">Nombre d&apos;invités</Label>
            <Input id="guests" name="guests" inputMode="numeric" placeholder="200" />
            <FieldError message={state.errors?.guests} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="eventDate">Date</Label>
            <CustomDatePicker
              value={eventDate}
              onChange={setEventDate}
              placeholder="Choisir une date"
              aria-label="Date de l'événement"
              disabled={flexible}
            />
            <FieldError message={state.errors?.eventDate} />

            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="isDateFlexible"
                checked={flexible}
                onChange={(event) => setFlexible(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/30"
              />
              Ma date est souple
            </label>
          </div>

          <div>
            <Label htmlFor="city">Ville</Label>
            <Select id="city" name="city" defaultValue={preselectedCity ?? "Cotonou"}>
              {cities.map((city) => (
                <option key={city.slug} value={city.name}>
                  {city.name}
                </option>
              ))}
            </Select>
            <FieldError message={state.errors?.city} />

            <Label htmlFor="district" className="mt-4 block">
              Quartier
            </Label>
            <Input id="district" name="district" placeholder="Haie Vive" />
          </div>
        </div>

        <div>
          <Label htmlFor="description">Décrivez ce que vous attendez</Label>
          <Textarea
            id="description"
            name="description"
            rows={6}
            placeholder="Ambiance, contraintes, horaires, plats souhaités, style de décoration… Plus vous êtes précis, plus les devis seront justes."
            required
          />
          <FieldError message={state.errors?.description} />
        </div>
      </Section>

      <Section
        title="Budget et délai"
        description="Le budget reste entre vous et les prestataires que vous avez sollicités. Il n'est jamais affiché publiquement."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="budgetMax">Budget maximum, toutes prestations (FCFA)</Label>
            <Input
              id="budgetMax"
              name="budgetMax"
              inputMode="numeric"
              placeholder="5000000"
              value={globalBudget}
              onChange={(event) => setGlobalBudget(event.target.value)}
            />
            <FieldError message={state.errors?.budgetMax} />
            <p className="mt-1 text-xs text-slate-400">
              Facultatif, mais un budget annoncé évite les devis hors sujet.
            </p>
          </div>

          <div>
            <Label htmlFor="responseWindowHours">Délai de réponse souhaité</Label>
            <Select id="responseWindowHours" name="responseWindowHours" defaultValue="48">
              {RESPONSE_WINDOWS.map((window) => (
                <option key={window.value} value={window.value}>
                  {window.label}
                </option>
              ))}
            </Select>
            <FieldError message={state.errors?.responseWindowHours} />
          </div>
        </div>

        {costCenters.length > 0 ? (
          <div>
            <Label htmlFor="costCenterId">Centre de coût</Label>
            <Select id="costCenterId" name="costCenterId" defaultValue="">
              <option value="">Aucun</option>
              {costCenters.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.code} — {center.name}
                </option>
              ))}
            </Select>
            <FieldError message={state.errors?.costCenterId} />
            <p className="mt-1 text-xs text-slate-400">
              C&apos;est ce rattachement qui fait apparaître la dépense dans le suivi
              budgétaire de votre entreprise.
            </p>
          </div>
        ) : null}

        <div>
          <Label htmlFor="contactPhone">Téléphone</Label>
          <Input id="contactPhone" name="contactPhone" placeholder={PHONE_PLACEHOLDER} />
          <FieldError message={state.errors?.contactPhone} />
          <p className="mt-1 text-xs text-slate-400">
            Communiqué uniquement aux prestataires dont vous retenez l&apos;offre.
          </p>
        </div>
      </Section>

      {state.message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Envoyer ma demande
        </Button>
        <p className="text-sm text-slate-500">
          Gratuit et sans engagement. Vous choisissez, ou vous ne choisissez pas.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
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

/** Lecture indulgente : « 1 500 000 » saisi à la main doit valoir 1500000. */
function toAmount(value: string | undefined): number {
  const parsed = Number((value ?? "").replace(/\s/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatAmount(amount: number): string {
  return format(money(amount));
}
