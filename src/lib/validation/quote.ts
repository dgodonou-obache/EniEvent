import { z } from "zod";

import { PRICE_UNITS } from "../units";
import { isValidBeninPhone, PHONE_ERROR } from "./phone";

/**
 * Saisie d'un appel d'offres et des propositions qui y répondent.
 *
 * Ce que ces schémas n'acceptent pas est aussi important que ce qu'ils
 * acceptent : ni `requester_id`, ni `status`, ni `org_id` de partenaire. Le
 * demandeur vient de la session, le statut relève de la machine à états, et
 * l'organisation qui propose vient de l'appartenance de l'utilisateur.
 */

const amount = z
  .number()
  .int("Le montant doit être un nombre entier de francs.")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(1_000_000_000, "Ce montant paraît erroné.");

/** Doit rester aligné sur l'énumération `event_type` de la base. */
export const EVENT_TYPE_VALUES = [
  "mariage",
  "anniversaire",
  "bapteme",
  "seminaire",
  "conference",
  "lancement",
  "ceremonie",
  "funerailles",
  "autre",
] as const;

export type EventType = (typeof EVENT_TYPE_VALUES)[number];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  mariage: "Mariage",
  anniversaire: "Anniversaire",
  bapteme: "Baptême",
  seminaire: "Séminaire",
  conference: "Conférence",
  lancement: "Lancement de produit",
  ceremonie: "Cérémonie",
  funerailles: "Funérailles",
  autre: "Autre",
};

export const EVENT_TYPES = EVENT_TYPE_VALUES.map((value) => ({
  value,
  label: EVENT_TYPE_LABELS[value],
}));

/** Fenêtres de réponse proposées au client, en heures. */
export const RESPONSE_WINDOWS = [
  { value: 24, label: "24 heures — j'ai besoin de réponses vite" },
  { value: 48, label: "48 heures — recommandé" },
  { value: 72, label: "72 heures — je ne suis pas pressé" },
] as const;

export const categoryBudgetSchema = z.object({
  categoryId: z.uuid(),
  budgetMax: amount.optional(),
});

export type CategoryBudget = z.infer<typeof categoryBudgetSchema>;

export const briefSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Décrivez votre événement en quelques mots (5 caractères minimum).")
      .max(160, "Ce titre est trop long."),
    eventType: z.enum(EVENT_TYPE_VALUES, { error: "Choisissez un type d'événement." }),
    eventDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une date.")
      .optional()
      .or(z.literal("")),
    isDateFlexible: z.boolean().optional(),
    city: z.string().trim().min(2, "Choisissez une ville."),
    district: z.string().trim().max(120).optional().or(z.literal("")),
    guests: z
      .number()
      .int("Indiquez un nombre entier d'invités.")
      .min(1, "Il faut au moins un invité.")
      .max(100_000, "Ce nombre paraît erroné.")
      .optional(),
    budgetMax: amount.optional(),
    /**
     * Enveloppe par prestation. « 5 000 000 F pour un mariage » ne dit rien à
     * un traiteur : soit il chiffre à l'aveugle, soit il suppose que toute la
     * somme est pour lui. Facultatif, parce que beaucoup de clients ne savent
     * pas encore répartir — l'exiger ferait abandonner le formulaire.
     */
    categoryBudgets: z.array(categoryBudgetSchema).max(8).optional(),
    description: z
      .string()
      .trim()
      .min(20, "Détaillez un peu : les prestataires répondent mieux à un besoin précis.")
      .max(5000, "Cette description est trop longue."),
    contactPhone: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidBeninPhone(value), PHONE_ERROR)
      .optional()
      .or(z.literal("")),
    // Au moins une catégorie : un appel d'offres sans besoin n'atteint personne.
    categoryIds: z
      .array(z.uuid())
      .min(1, "Choisissez au moins une prestation recherchée.")
      .max(8, "Huit prestations au maximum pour une même demande."),
    responseWindowHours: z
      .number()
      .int()
      .refine(
        (value) => RESPONSE_WINDOWS.some((w) => w.value === value),
        "Choisissez un délai de réponse proposé.",
      ),
  })
  .refine(
    (brief) => brief.isDateFlexible === true || (brief.eventDate ?? "") !== "",
    {
      // Sans date ni mention de souplesse, un prestataire ne peut pas dire s'il
      // est libre — et ne répondra pas.
      message: "Indiquez une date, ou cochez « ma date est souple ».",
      path: ["eventDate"],
    },
  )
  .refine(
    (brief) =>
      (brief.categoryBudgets ?? []).every((budget) =>
        brief.categoryIds.includes(budget.categoryId),
      ),
    {
      // Un budget rattaché à une prestation non demandée serait ignoré en
      // silence : mieux vaut refuser que de laisser croire qu'il compte.
      message: "Un budget vise une prestation qui n'est pas demandée.",
      path: ["categoryBudgets"],
    },
  );

export const quoteHeaderSchema = z.object({
  message: z
    .string()
    .trim()
    .max(3000, "Ce message est trop long.")
    .optional()
    .or(z.literal("")),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez une date de validité.")
    .optional()
    .or(z.literal("")),
  listingId: z.uuid().optional().or(z.literal("")),
});

export const quoteLineSchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Nommez la prestation.")
    .max(200, "Ce libellé est trop long."),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  quantity: z
    .number()
    .int("La quantité doit être un nombre entier.")
    .min(1, "La quantité doit être d'au moins 1.")
    .max(100_000, "Cette quantité paraît erronée."),
  unit: z.enum(PRICE_UNITS),
  unitPrice: amount,
});

export const declineSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Dites au prestataire pourquoi, en une phrase : c'est ce qui le fera progresser.")
    .max(600, "Ce motif est trop long."),
});

export type Brief = z.infer<typeof briefSchema>;
export type QuoteHeader = z.infer<typeof quoteHeaderSchema>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;

// Les libellés d'unités vivent dans `@/lib/units`, avec la liste elle-même.
