import Link from "next/link";
import { Check } from "lucide-react";

import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata = { title: "Devenir partenaire" };

const BENEFITS = [
  "Votre calendrier et vos tarifs, à jour en permanence",
  "Des demandes de devis qualifiées, avec le budget annoncé",
  "Paiement sécurisé : vous êtes réglé après l'événement",
];

export default function PartnerSignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Devenir partenaire</h1>
      <p className="mt-1 text-sm text-slate-500">
        Salle, traiteur, décoration, matériel, animation : présentez votre offre aux
        organisateurs d&apos;événements du Bénin.
      </p>

      <ul className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <SignUpForm variant="partenaire" redirectTo="/pro/dashboard" />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Vous êtes déjà référencé ?{" "}
        <Link href="/pro/connexion" className="font-medium text-orange-600 hover:underline">
          Se connecter
        </Link>
      </p>

      <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">
        La publication de vos annonces est soumise à une vérification de nos équipes,
        généralement sous 48 heures ouvrées.
      </p>
    </>
  );
}
