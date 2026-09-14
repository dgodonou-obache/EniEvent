import { z } from "zod";

import { isValidBeninPhone, PHONE_ERROR } from "./phone";

/**
 * Saisies de l'espace entreprise.
 *
 * Ni `org_id`, ni les statuts n'y figurent : l'organisation vient de la session,
 * et les décisions d'aval passent par des fonctions Postgres. Accepter ces
 * champs en entrée permettrait de piloter le budget d'une autre entreprise.
 */

const amount = z
  .number()
  .int("Le montant doit être un nombre entier de francs.")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(100_000_000_000, "Ce montant paraît erroné.");

export const costCenterSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Le code doit faire au moins 2 caractères.")
      .max(20, "Le code est trop long.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 _-]*$/,
        "Lettres, chiffres, tiret et tiret bas uniquement.",
      ),
    name: z
      .string()
      .trim()
      .min(3, "Nommez ce centre de coût.")
      .max(120, "Ce nom est trop long."),
    budgetAmount: amount.optional(),
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide.")
      .optional()
      .or(z.literal("")),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide.")
      .optional()
      .or(z.literal("")),
    isActive: z.boolean().optional(),
  })
  .refine(
    (center) =>
      !center.periodStart || !center.periodEnd || center.periodEnd >= center.periodStart,
    {
      message: "La fin de période ne peut pas précéder son début.",
      path: ["periodEnd"],
    },
  );

export const companySettingsSchema = z.object({
  /**
   * `undefined` = aucun contrôle. Une petite structure n'a pas de circuit de
   * validation ; lui en imposer un la ferait renoncer à l'espace entreprise.
   */
  approvalThreshold: amount.optional(),
  approvePublication: z.boolean().optional(),
});

export const companyProfileSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, "Indiquez la raison sociale.")
    .max(200, "Ce nom est trop long."),
  brandName: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Choisissez une ville."),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidBeninPhone(value), PHONE_ERROR)
    .optional()
    .or(z.literal("")),
  // Une seule adresse de facturation, portée par l'organisation.
  billingEmail: z.email("Adresse e-mail invalide.").optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  // Registres béninois : le RCCM identifie la société, l'IFU le contribuable.
  rccm: z.string().trim().max(60).optional().or(z.literal("")),
  ifu: z.string().trim().max(60).optional().or(z.literal("")),
});

export const approvalDecisionSchema = z
  .object({
    approve: z.boolean(),
    reason: z.string().trim().max(600, "Ce motif est trop long.").optional().or(z.literal("")),
  })
  .refine((decision) => decision.approve || (decision.reason ?? "").trim().length >= 10, {
    // Un refus sans motif laisse le demandeur sans rien à corriger.
    message: "Dites au demandeur pourquoi vous refusez, en une phrase.",
    path: ["reason"],
  });

export type CostCenterInput = z.infer<typeof costCenterSchema>;
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

/** Rôles de l'espace entreprise, dits en clair. */
export const COMPANY_ROLES = [
  { value: "owner", label: "Propriétaire", hint: "Tous les droits, y compris la facturation." },
  { value: "admin", label: "Administrateur", hint: "Gère l'équipe et les réglages." },
  { value: "organizer", label: "Organisateur", hint: "Crée les demandes et compare les offres." },
  { value: "approver", label: "Valideur", hint: "Donne son aval aux engagements." },
  { value: "finance", label: "Finance", hint: "Budgets, centres de coûts et facturation." },
  { value: "viewer", label: "Lecture seule", hint: "Consulte sans rien modifier." },
] as const;

export const COMPANY_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  COMPANY_ROLES.map((role) => [role.value, role.label]),
);

/** Les rôles qui engagent l'entreprise, alignés sur `app.can_approve`. */
export const APPROVER_ROLES: readonly string[] = ["owner", "admin", "approver", "finance"];
