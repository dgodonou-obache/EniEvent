import { ShieldCheck } from "lucide-react";

import { ModerationCard } from "@/components/dashboard/ModerationCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getModerationQueue } from "@/lib/admin";

export const metadata = { title: "Annonces à valider" };

export default async function ModerationPage() {
  const queue = await getModerationQueue();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Annonces à valider</h1>
      <p className="mt-1 text-sm text-slate-500">
        {queue.length === 0
          ? "Rien en attente."
          : `${queue.length} annonce${queue.length > 1 ? "s" : ""} en attente, la plus ancienne en premier.`}
      </p>

      <div className="mt-6">
        {queue.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="La file est vide"
            description="Toutes les annonces soumises ont été traitées. Les nouvelles soumissions apparaîtront ici, la plus ancienne en tête."
          />
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <ModerationCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
