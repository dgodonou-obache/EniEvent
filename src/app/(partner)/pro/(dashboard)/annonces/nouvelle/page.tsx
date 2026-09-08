import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ListingCreateForm } from "@/components/dashboard/ListingCreateForm";
import { getListingFormOptions } from "@/lib/partner";

export const metadata = { title: "Nouvelle annonce" };

export default async function NewListingPage() {
  const { categoryGroups, cities } = await getListingFormOptions();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/pro/annonces"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-orange-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Mes annonces
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nouvelle annonce</h1>
      <p className="mt-1 text-sm text-slate-500">
        Quatre informations suffisent pour commencer. Vous compléterez la description, les
        tarifs et les disponibilités à l&apos;étape suivante.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6">
        <ListingCreateForm categoryGroups={categoryGroups} cities={cities} />
      </div>
    </div>
  );
}
