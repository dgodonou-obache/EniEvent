import Link from "next/link";
import { Construction } from "lucide-react";

import { Button } from "@/components/ui/button";

import { lotFor, navItemFor, type Space } from "./roadmap";

interface UpcomingPageProps {
  space: Space;
  /** Segments captés par la route attrape-tout de l'espace. */
  segments: string[];
  basePath: string;
}

/**
 * Écran affiché sur les routes de back-office pas encore construites.
 *
 * Un 404 sur un lien de menu fait douter de l'installation ; une page qui
 * nomme le lot à venir se comprend. Elle disparaît d'elle-même dès que la
 * vraie page existe : Next donne la priorité à la route la plus spécifique.
 */
export function UpcomingPage({ space, segments, basePath }: UpcomingPageProps) {
  const pathname = segments.length > 0 ? `${basePath}/${segments.join("/")}` : basePath;
  const item = navItemFor(space, pathname);
  const title = item?.label ?? "Page en construction";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
          <Construction className="h-6 w-6 text-orange-500" aria-hidden />
        </div>

        <p className="micro-label mt-4 text-orange-500">{lotFor(pathname)}</p>

        <p className="mt-2 text-sm text-slate-500">
          Cet écran n&apos;est pas encore construit. Il arrivera avec le lot indiqué
          ci-dessus.
        </p>

        <p className="mt-4 font-mono text-xs text-slate-400">{pathname}</p>

        <div className="mt-6">
          <Link href={basePath}>
            <Button variant="outline" size="sm">
              Retour au tableau de bord
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
