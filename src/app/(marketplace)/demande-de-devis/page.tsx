import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Clock, Scale } from "lucide-react";

import { BriefForm } from "@/components/marketplace/BriefForm";
import { getUser } from "@/lib/auth/session";
import { getBriefOptions } from "@/lib/quotes";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Demander des devis",
  description:
    "Décrivez votre événement une seule fois et recevez plusieurs devis de prestataires béninois.",
};

/**
 * Dépôt d'un appel d'offres.
 *
 * L'authentification est exigée avant l'affichage : laisser remplir un long
 * formulaire pour n'annoncer qu'à l'envoi qu'il faut un compte est le plus sûr
 * moyen de perdre le client. Le paramètre `suite` ramène ici après connexion.
 */
export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ annonce?: string }>;
}) {
  const [user, params] = await Promise.all([getUser(), searchParams]);

  if (!user) redirect("/connexion?suite=/demande-de-devis");

  const options = await getBriefOptions();

  // Demande partie d'une fiche : la catégorie et la ville sont déjà connues.
  let preselectedCategoryId: string | undefined;
  let preselectedCity: string | undefined;

  if (params.annonce) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("listings")
      .select("category_id, city")
      .eq("slug", params.annonce)
      .maybeSingle();

    preselectedCategoryId = data?.category_id ?? undefined;
    preselectedCity = data?.city ?? undefined;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Décrivez votre événement, recevez plusieurs devis
      </h1>
      <p className="mt-2 text-slate-500">
        Un seul formulaire. Les prestataires concernés vous répondent, vous comparez leurs
        offres côte à côte, et vous choisissez.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <Step icon={ClipboardList} n={1} title="Vous décrivez" body="Une fois, pour tous." />
        <Step icon={Clock} n={2} title="Ils répondent" body="Dans le délai que vous fixez." />
        <Step icon={Scale} n={3} title="Vous comparez" body="Prix et détail, côte à côte." />
      </ol>

      <div className="mt-8">
        <BriefForm
          families={options.families}
          cities={options.cities}
          preselectedCategoryId={preselectedCategoryId}
          preselectedCity={preselectedCity}
        />
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        Vous savez déjà ce que vous voulez ?{" "}
        <Link href="/recherche" className="font-bold text-orange-600 hover:underline">
          Réservez directement
        </Link>
        .
      </p>
    </div>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50">
        <Icon className="h-4.5 w-4.5 text-orange-500" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">
        {n}. {title}
      </p>
      <p className="text-sm text-slate-500">{body}</p>
    </li>
  );
}
