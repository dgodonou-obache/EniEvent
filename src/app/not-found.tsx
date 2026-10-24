import Link from "next/link";
import { Compass, Search } from "lucide-react";

/**
 * Page introuvable.
 *
 * ⚠️ **Il n'y en avait aucune, et Next rendait donc la sienne** : « 404 — This
 * page could not be found », en anglais, sur fond blanc, sans une trace de la
 * marque. Mesuré le 24 octobre 2026 sur `/pro`, mais le même écran servait
 * toute adresse inconnue du site public — y compris une faute de frappe dans
 * une adresse dictée au téléphone, ou un vieux lien partagé.
 *
 * C'est la même faute que l'écran « This page couldn't load » de la coupure par
 * inactivité : l'utilisateur ne lit pas « cette adresse n'existe pas », il lit
 * « ce site est cassé ». Et sur une place de marché où l'on règle de vraies
 * sommes, cette impression-là coûte une vente.
 *
 * Une page introuvable **dit quoi faire ensuite**, comme un état vide : chercher
 * dans le catalogue, ou revenir à l'accueil. Elle ne porte en revanche
 * **aucun lien vers un espace privé** (`CLAUDE.md` §4) — elle s'affiche aussi
 * devant un visiteur qui n'a pas de session, et proposer « Mon compte » à
 * quelqu'un qui n'en a pas est une impasse de plus.
 */

export const metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <p className="text-center text-xl font-bold tracking-tight text-slate-900">
        <span className="text-orange-500">Éni</span>Event
      </p>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
          <Compass className="h-7 w-7 text-orange-500" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-900">Cette page n&apos;existe pas</h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
          L&apos;adresse est peut-être incomplète, ou la page a changé de place. Le reste du
          site fonctionne normalement.
        </p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/recherche"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-orange-600 active:scale-[0.98]"
          >
            <Search className="h-4 w-4" aria-hidden />
            Chercher un lieu ou un prestataire
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
          >
            Revenir à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
