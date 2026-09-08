import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, Zap } from "lucide-react";

import { HeroSearch } from "@/components/marketplace/HeroSearch";
import { Button } from "@/components/ui/button";
import { getFilterOptions } from "@/lib/listings";

/**
 * Visuel de fond du bandeau.
 *
 * Fichier local plutôt qu'URL distante : Next peut alors le redimensionner et
 * le servir en WebP ou AVIF selon le navigateur, ce qui divise son poids par
 * trois ou quatre sur mobile. Le JPEG d'origine fait 468 Ko en 2400 px.
 *
 * `public/images/hero-accueil.svg` reste disponible comme variante vectorielle
 * sans photographie, aux couleurs de la charte.
 */
const HERO_IMAGE = "/images/hero-accueil.jpg";

export default async function HomePage() {
  const { cities, categoryGroups, amenities } = await getFilterOptions();

  return (
    <main>
      <section className="relative isolate overflow-hidden">
        {/* `alt` vide et `aria-hidden` : l'image est décorative, elle ne porte
            aucune information que le texte ne dise déjà. `priority` car c'est
            le plus grand élément visible au chargement. */}
        <Image
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />

        {/* Voile sombre : sans lui, le texte blanc devient illisible sur les
            zones claires de la photo — nappe, verrerie, fleurs pâles. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-900/45 via-slate-900/55 to-slate-900/65"
        />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 lg:px-8 lg:pb-20 lg:pt-14">
          {/* La recherche ouvre le bandeau : le visiteur qui sait ce qu'il
              cherche n'a pas à lire l'accroche pour commencer. */}
          <HeroSearch cities={cities} categoryGroups={categoryGroups} amenities={amenities} />

          {/* Sur photo, le texte passe en blanc : l'orange pêche de la charte
              n'a pas un contraste suffisant en petit corps sur fond sombre. Il
              reste la couleur des actions — le bouton « Rechercher » ci-dessus. */}
          <div className="mt-14 text-center lg:mt-16">
            <p className="micro-label text-orange-300">Bénin</p>

            <h1 className="mx-auto mt-3 max-w-4xl text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
              Organisez vos événements, du lieu au dernier détail.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-100">
              Salles, traiteurs, décoration, location d&apos;équipement, maîtres de
              cérémonie&nbsp;: à Cotonou, Porto-Novo, Abomey-Calavi et partout au Bénin.
              Réservez immédiatement au prix affiché, ou décrivez votre projet et recevez
              plusieurs devis comparables.
            </p>

            {/* Centrés eux aussi : les laisser alignés à gauche sous un bloc
                centré donnerait l'impression d'un défaut de mise en page. */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link
                href="/lieux"
                className="font-medium text-white underline-offset-4 transition-colors hover:text-orange-300 hover:underline"
              >
                Voir toutes les salles
              </Link>
              <Link
                href="/prestataires"
                className="font-medium text-white underline-offset-4 transition-colors hover:text-orange-300 hover:underline"
              >
                Voir tous les prestataires
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="rounded-2xl border border-slate-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50">
              <Zap className="h-5 w-5 text-orange-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Réservation immédiate</h2>
            <p className="mt-2 text-sm text-slate-500">
              Le prix est affiché, les dates disponibles sont à jour. Vous choisissez,
              vous payez un acompte, la date est bloquée.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-100 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50">
              <FileText className="h-5 w-5 text-teal-600" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Demande de devis</h2>
            <p className="mt-2 text-sm text-slate-500">
              Pour un mariage ou un séminaire, décrivez votre projet une seule fois.
              Plusieurs prestataires vous répondent, vous comparez leurs offres côte à côte.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Tous les métiers de l&apos;événement
          </h2>
          <Link href="/categories">
            <Button variant="ghost" size="sm">
              Tout voir
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        </div>

        {/* Les catégories viennent de la base : plus de liste écrite en dur qui
            se désynchronise du référentiel. */}
        <div className="mt-6 space-y-6">
          {categoryGroups.map((family) => (
            <div key={family.slug}>
              <p className="micro-label mb-2 text-slate-400">{family.name}</p>
              <ul className="flex flex-wrap gap-2">
                {family.children.map((child) => (
                  <li key={child.slug}>
                    <Link
                      href={`/categories/${child.slug}`}
                      className="block rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
