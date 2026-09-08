import { z } from "zod";

import { isValidBeninPhone, normaliseBeninPhone, PHONE_ERROR } from "./phone";

/**
 * Schémas de saisie partagés entre le formulaire et le serveur.
 *
 * Les messages sont destinés à l'utilisateur : ils disent quoi corriger, pas
 * quelle règle a échoué.
 */

// La saisie est normalisée avant d'être validée, puis stockée sous sa forme
// canonique : « 01 97 00 00 01 », « +229 01 97 00 00 01 » et « 0197000001 »
// désignent le même numéro et ne doivent pas produire trois valeurs en base.
const phone = z
  .string()
  .trim()
  .refine(isValidBeninPhone, PHONE_ERROR)
  .transform(normaliseBeninPhone);

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit faire au moins 10 caractères.")
  .max(128, "Le mot de passe est trop long.")
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: "Le mot de passe doit contenir au moins une lettre et un chiffre.",
  });

const base = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom.").max(120),
  email: z.email("Adresse e-mail invalide."),
  phone: phone.optional().or(z.literal("")),
  password: passwordSchema,
});

export const individualSignUpSchema = base;

const withCompany = base.extend({
  companyName: z
    .string()
    .trim()
    .min(2, "Indiquez le nom de votre structure.")
    .max(160),
  city: z.string().trim().min(2, "Indiquez votre ville.").max(80),
});

export const companySignUpSchema = withCompany;

export const partnerSignUpSchema = withCompany.extend({
  // Un prestataire est joignable : c'est la première chose que demandera un client.
  phone,
});

export type IndividualSignUp = z.infer<typeof individualSignUpSchema>;
export type CompanySignUp = z.infer<typeof companySignUpSchema>;
export type PartnerSignUp = z.infer<typeof partnerSignUpSchema>;

export type SignUpVariant = "particulier" | "entreprise" | "partenaire";

export function schemaFor(variant: SignUpVariant) {
  switch (variant) {
    case "particulier":
      return individualSignUpSchema;
    case "entreprise":
      return companySignUpSchema;
    case "partenaire":
      return partnerSignUpSchema;
  }
}

/**
 * Métadonnées transmises à `supabase.auth.signUp`, lues par le déclencheur
 * `app.handle_new_user` pour créer profil et organisation.
 *
 * `account_type` y figure, mais la base ignore délibérément la valeur « admin » :
 * ces métadonnées sont sous le contrôle du client.
 */
export function signUpMetadata(
  variant: SignUpVariant,
  values: Record<string, string | undefined>,
) {
  return {
    full_name: values.fullName,
    phone: values.phone || undefined,
    account_type: variant,
    company_name: variant === "particulier" ? undefined : values.companyName,
    city: values.city,
    country: values.country,
  };
}
