"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { schemaFor, signUpMetadata, type SignUpVariant } from "@/lib/validation/auth";
import { PHONE_PLACEHOLDER } from "@/lib/validation/phone";
import { createClient } from "@/utils/supabase/client";

// ÉniEvent ouvre au Bénin. Le champ reste dans le formulaire — le schéma est
// multi-pays — mais n'offre qu'une valeur tant que l'ouverture régionale n'est
// pas décidée.
const COUNTRIES = [{ code: "BJ", label: "Bénin" }];

interface SignUpFormProps {
  variant: SignUpVariant;
  redirectTo: string;
}

export function SignUpForm({ variant, redirectTo }: SignUpFormProps) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState<string | null>(null);

  const needsCompany = variant !== "particulier";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = schemaFor(variant).safeParse(raw);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        // On garde le premier message par champ : empiler les reproches sur un
        // même champ n'aide personne.
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: signUpMetadata(variant, { ...raw, country: raw.country }),
        emailRedirectTo: `${window.location.origin}/auth/callback?suivant=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setFormError(
        error.message.toLowerCase().includes("already")
          ? "Un compte existe déjà avec cette adresse. Connectez-vous plutôt."
          : "La création du compte a échoué. Réessayez dans un instant.",
      );
      setIsPending(false);
      return;
    }

    // Sans session, la confirmation d'e-mail est active : le compte existe mais
    // n'est pas encore utilisable. Le dire clairement évite l'impression d'échec.
    if (!data.session) {
      setAwaitingConfirmation(parsed.data.email);
      setIsPending(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  if (awaitingConfirmation) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
          <MailCheck className="h-6 w-6 text-teal-600" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Vérifiez votre boîte mail</h2>
        <p className="mt-2 text-sm text-slate-500">
          Nous avons envoyé un lien de confirmation à{" "}
          <span className="font-medium text-slate-900">{awaitingConfirmation}</span>. Cliquez
          dessus pour activer votre compte.
        </p>
        <p className="mt-4 text-xs text-slate-400">
          Pensez à regarder dans vos courriers indésirables.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field
        id="fullName"
        label="Votre nom complet"
        placeholder="Awa Koné"
        autoComplete="name"
        error={errors.fullName}
      />

      {needsCompany ? (
        <>
          <Field
            id="companyName"
            label={variant === "partenaire" ? "Nom de votre structure" : "Nom de votre entreprise"}
            placeholder={variant === "partenaire" ? "Saveurs du Bénin" : "ACME Bénin"}
            autoComplete="organization"
            error={errors.companyName}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="city" label="Ville" placeholder="Cotonou" error={errors.city} />
            <div>
              <Label htmlFor="country">Pays</Label>
              <Select id="country" name="country" defaultValue="CI">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </>
      ) : null}

      <Field
        id="email"
        label="Adresse e-mail"
        type="email"
        placeholder="vous@exemple.com"
        autoComplete="email"
        error={errors.email}
      />

      <Field
        id="phone"
        label={variant === "partenaire" ? "Téléphone" : "Téléphone (facultatif)"}
        type="tel"
        placeholder={PHONE_PLACEHOLDER}
        autoComplete="tel"
        error={errors.phone}
      />

      <Field
        id="password"
        label="Mot de passe"
        type="password"
        placeholder="Au moins 10 caractères"
        autoComplete="new-password"
        error={errors.password}
        hint="Au moins 10 caractères, dont une lettre et un chiffre."
      />

      {formError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {isPending ? "Création…" : "Créer mon compte"}
      </Button>
    </form>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

function Field({ id, label, error, hint, ...props }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
