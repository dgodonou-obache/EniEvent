import { AlertTriangle } from "lucide-react";

import { entityIsComplete, LAST_UPDATED } from "@/lib/legal";

/**
 * Mise en page commune aux textes légaux.
 *
 * **Le bandeau d'avertissement n'est pas décoratif.** Tant que l'identité
 * légale n'est pas renseignée (`src/lib/legal.ts`), ces pages ne valent rien :
 * un prestataire de paiement les refusera, et un client n'y trouvera pas à qui
 * il a affaire. Le dire en haut de page est désagréable, et c'est le but —
 * cela ne se corrige qu'en remplissant les champs.
 *
 * ⚠️ **Son texte ne nomme aucune mention en particulier.** Il a d'abord dit
 * que l'immatriculation n'était pas publiée ; le jour où le RCCM et l'IFU ont
 * été renseignés, il s'est mis à contredire la ligne affichée trois
 * centimètres plus bas, alors que deux autres mentions manquaient bel et bien.
 * Un avertissement qui désigne la mauvaise lacune est pire que pas
 * d'avertissement : il se fait démentir par la page qu'il commente. Les
 * champs manquants se signalent déjà un par un, en orange, par `Entry`.
 *
 * Largeur bornée à `max-w-3xl` : un texte juridique en pleine largeur ne se lit
 * pas, et personne ne lit ce qui ne se lit pas.
 */

interface Props {
  title: string;
  /** Une phrase disant à quoi sert ce texte, en clair. */
  intro: string;
  children: React.ReactNode;
}

export function LegalPage({ title, intro, children }: Props) {
  const complet = entityIsComplete();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">{intro}</p>
      <p className="mt-2 text-xs text-slate-400">Dernière mise à jour : {LAST_UPDATED}</p>

      {!complet ? (
        <p className="mt-6 flex items-start gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Document en cours de finalisation.</strong> Quelques mentions de
            l&apos;éditeur restent à publier ; elles apparaissent ci-dessous comme « à
            compléter ». Pour toute question, écrivez-nous — nous répondons sous un jour
            ouvré.
          </span>
        </p>
      ) : null}

      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

/** Une section numérotée. Le titre reste court : on doit pouvoir le citer. */
export function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

/** Un couple libellé / valeur, pour les mentions d'identité. */
export function Entry({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex flex-wrap gap-x-2 text-sm leading-relaxed">
      <span className="font-medium text-slate-900">{label}</span>
      <span className={value === "à compléter" ? "italic text-orange-700" : "text-slate-600"}>
        {value}
      </span>
    </p>
  );
}
