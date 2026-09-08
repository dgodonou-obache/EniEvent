import { z } from "zod";

import { PRICE_UNITS } from "../units";

/**
 * Saisie d'une annonce par un partenaire.
 *
 * Ce que ces schémas ne contiennent **pas** est aussi important que ce qu'ils
 * contiennent : ni `org_id`, ni `status`, ni `kind`. Ces trois-là ne viennent
 * jamais du formulaire — l'organisation est déduite de la session, le statut
 * relève de la modération, et la nature découle de la catégorie choisie.
 * Les accepter en entrée ouvrirait la porte à la publication d'une annonce au
 * nom d'un autre prestataire, ou à l'auto-validation.
 */

const price = z
  .number()
  .int("Le montant doit être un nombre entier de francs.")
  .min(0, "Le montant ne peut pas être négatif")
  .max(1_000_000_000, "Ce montant paraît erroné.");

export const listingDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Le titre doit faire au moins 3 caractères.")
    .max(160, "Le titre est trop long."),
  categoryId: z.uuid("Choisissez une catégorie."),
  city: z.string().trim().min(2, "Choisissez une ville."),
  district: z.string().trim().max(120).optional().or(z.literal("")),
  bookingMode: z.enum(["instant", "quote", "both"], {
    error: "Choisissez un mode de réservation.",
  }),
});

export const listingDetailsSchema = z.object({
  description: z.string().trim().max(5000, "La description est trop longue.").optional(),
  address: z.string().trim().max(240).optional(),
  minNoticeDays: z.number().int().min(0).max(365).optional(),
  paymentTerms: z.string().trim().max(600).optional(),
  cancellationPolicyId: z.uuid().optional().or(z.literal("")),
  // Prix plancher : garde-fou du prestataire contre sa propre faute de frappe.
  minPrice: price.optional(),
});

export const venueDetailsSchema = z
  .object({
    capacitySeated: z.number().int().min(0).max(100_000).optional(),
    capacityStanding: z.number().int().min(0).max(100_000).optional(),
    capacityCocktail: z.number().int().min(0).max(100_000).optional(),
    surfaceM2: z.number().int().min(1).max(1_000_000).optional(),
    parkingSpots: z.number().int().min(0).max(10_000).optional(),
    hasOutdoorSpace: z.boolean().optional(),
    hasKitchen: z.boolean().optional(),
    accessibilityPmr: z.boolean().optional(),
    noiseCurfewHour: z.number().int().min(0).max(23).optional(),
  })
  .refine(
    (v) =>
      v.capacitySeated == null ||
      v.capacityStanding == null ||
      v.capacityStanding >= v.capacitySeated,
    {
      message: "La capacité debout ne peut pas être inférieure à la capacité assise.",
      path: ["capacityStanding"],
    },
  );

export const serviceDetailsSchema = z
  .object({
    minGuests: z.number().int().min(0).max(100_000).optional(),
    maxGuests: z.number().int().min(0).max(100_000).optional(),
    travelRadiusKm: z.number().int().min(0).max(2000).optional(),
    setupTimeMin: z.number().int().min(0).max(2880).optional(),
  })
  .refine((v) => v.minGuests == null || v.maxGuests == null || v.minGuests <= v.maxGuests, {
    message: "Le minimum d'invités ne peut pas dépasser le maximum.",
    path: ["maxGuests"],
  });

export const pricingRuleSchema = z.object({
  unit: z.enum(PRICE_UNITS),
  basePrice: price,
  weekendMultiplier: z
    .number()
    .min(1, "La majoration ne peut pas réduire le tarif.")
    .max(5, "Une majoration au-delà de 5× paraît erronée."),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;
export type ListingDetails = z.infer<typeof listingDetailsSchema>;
export type VenueDetails = z.infer<typeof venueDetailsSchema>;
export type ServiceDetails = z.infer<typeof serviceDetailsSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;

/**
 * Lit un champ numérique de formulaire. Un champ vide vaut « non renseigné »,
 * pas zéro — une capacité laissée vide ne signifie pas « aucune place ».
 *
 * Les espaces sont retirés avant lecture. En JavaScript, `\s` couvre l'espace
 * fine insécable (U+202F) qu'`Intl` insère entre les milliers, ainsi que
 * l'insécable ordinaire (U+00A0) : sans cela, un montant recopié depuis l'écran
 * — « 150 000 » — serait refusé comme n'étant pas un nombre. Le cas se produit
 * dans les champs de saisie libre du planning et des devis, où rien n'empêche
 * l'utilisateur de séparer ses milliers.
 */
export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const stripped = typeof value === "string" ? value.replace(/\s/g, "") : "";
  if (stripped === "") return undefined;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function optionalText(value: FormDataEntryValue | null): string | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "" ? undefined : raw;
}

/** Transforme les erreurs Zod en dictionnaire champ → premier message. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/**
 * Slug d'URL dérivé du titre, suffixé si besoin.
 * Les accents sont retirés à la main : imposer l'extension `unaccent` pour ça
 * seul ne se justifie pas.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
