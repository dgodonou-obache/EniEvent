import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  /** Le lot du plan qui livrera cet écran, ex. « Lot 3 ». */
  lot: string;
  description: string;
}

/**
 * Écran d'attente d'un lot ultérieur. Sert à rendre la navigation complète et
 * parcourable dès le lot 0 : chaque route du plan existe, et dit honnêtement
 * quand elle sera remplie. À supprimer au fur et à mesure des lots.
 */
export function PlaceholderPage({ title, lot, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
          <Construction className="h-6 w-6 text-orange-500" aria-hidden />
        </div>
        <p className="micro-label mt-4 text-orange-500">{lot}</p>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
