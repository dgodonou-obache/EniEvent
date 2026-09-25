import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ENTITY } from "@/lib/legal";

/**
 * Après la suppression.
 *
 * ⚠️ **Page publique, et sans aucune donnée.** Elle est atteinte par quelqu'un
 * qui vient d'être déconnecté : y lire la base serait au mieux inutile, au
 * pire une fuite. Le seul paramètre est le régime appliqué, et il ne désigne
 * personne.
 *
 * **On dit ce qui reste.** « Votre compte a été supprimé » tout court serait
 * un demi-mensonge quand des pièces comptables subsistent. Les deux cas ne se
 * racontent donc pas de la même façon.
 */

export const metadata = { title: "Compte supprimé" };

export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<{ regime?: string }>;
}) {
  const { regime } = await searchParams;
  const efface = regime === "efface";

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
      <div className="w-full">
        <p className="mb-6 text-center text-xl font-bold tracking-tight text-slate-900">
          <span className="text-orange-500">Éni</span>Event
        </p>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <CheckCircle2 className="h-6 w-6 text-teal-600" aria-hidden />
          </span>

          <h1 className="mt-4 text-base font-bold text-slate-900">Votre compte a été supprimé</h1>

          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            {efface ? (
              <>
                Tout a été effacé : votre profil, vos favoris et vos préférences. Il ne reste rien
                de votre passage.
              </>
            ) : (
              <>
                Votre nom, votre téléphone et votre adresse ont été effacés. Les pièces des
                transactions que vous avez conclues sont conservées sans votre nom : elles ne sont
                pas seulement les vôtres, un prestataire en a besoin pour sa comptabilité.
              </>
            )}
          </p>

          <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-slate-400">
            Votre adresse e-mail est de nouveau libre. Si vous revenez un jour, une nouvelle
            inscription repartira d&apos;une page blanche.
          </p>

          <Link href="/" className="mt-6 inline-block">
            <Button variant="outline">Retour à l&apos;accueil</Button>
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Une question ?{" "}
          <a href={`mailto:${ENTITY.email}`} className="font-semibold text-slate-600 underline">
            {ENTITY.email}
          </a>
        </p>
      </div>
    </div>
  );
}
