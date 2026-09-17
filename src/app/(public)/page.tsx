import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, Zap } from "lucide-react";

import { HeroSearch } from "@/components/marketplace/HeroSearch";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { Button } from "@/components/ui/button";
import { getFilterOptions, getHomeSections } from "@/lib/listings";

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
  const [{ cities, categoryGroups, amenities }, { families, bookableNow }] = await Promise.all([
    getFilterOptions(),
    getHomeSections(),
  ]);

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

      {/* ------------------------------------------------------------------
          Réservez sans attendre.
          Mise en avant fondée sur un fait vérifiable — le partenaire accepte la
          réservation immédiate et a ouvert ses dates — et non sur une
          popularité qu'aucune donnée ne soutient : il n'existe encore ni avis,
          ni note, ni réservation. Le jour où ils existeront, une seconde
          section « Les valeurs sûres » prendra place ici.
         ------------------------------------------------------------------ */}
      {bookableNow.length > 0 ? (
        <section className="border-y border-slate-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="micro-label text-teal-600">Disponible maintenant</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Réservez sans attendre
                </h2>
                <p className="mt-2 max-w-xl text-slate-500">
                  Ces prestataires ont ouvert leur calendrier : vous choisissez votre date,
                  vous voyez le prix, vous réservez. Pas de devis, pas d&apos;attente.
                </p>
              </div>
              {/* `reservation`, pas `mode` : c'est la clé que lit `search.ts`.
                  Un lien avec la mauvaise clé n'échoue pas — il affiche
                  simplement toute la recherche, sans filtre, sans rien dire. */}
              <Link href="/recherche?reservation=instant" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Tout voir
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </Link>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {bookableNow.map((listing) => (
                <ListingCard key={listing.slug} listing={listing} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------
          Les métiers.
          Auparavant : 39 pastilles identiques, dont 27 sans la moindre annonce
          — cliquer « Photographe » menait à une page blanche. On ne montre ici
          que les familles réellement pourvues, avec leurs métiers les plus
          fournis. Le référentiel complet reste sur /categories, où l'on vient
          chercher précisément, pas découvrir.
         ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Par métier
            </h2>
            <p className="mt-2 text-slate-500">
              Ce que vous pouvez réserver aujourd&apos;hui au Bénin.
            </p>
          </div>
          <Link href="/categories">
            <Button variant="ghost" size="sm">
              Tous les métiers
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((family) => (
            <article
              key={family.slug}
              className="rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-bold text-slate-900">{family.name}</h3>
                <span className="micro-label shrink-0 text-slate-400">
                  {family.listings} {family.listings > 1 ? "offres" : "offre"}
                </span>
              </div>

              <ul className="mt-4 flex flex-wrap gap-2">
                {family.pourvues.map((metier) => (
                  <li key={metier.slug}>
                    <Link
                      href={`/categories/${metier.slug}`}
                      className="block rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
                    >
                      {metier.name}
                      <span className="ml-1.5 text-xs text-slate-400">{metier.listings}</span>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Dire ce qui n'est pas encore pourvu vaut mieux que de le
                  masquer : un partenaire y lit une place à prendre. */}
              {family.metiers > family.pourvues.length ? (
                <Link
                  href={`/categories/${family.slug}`}
                  className="mt-4 block text-sm font-medium text-slate-400 transition-all duration-200 hover:text-orange-600"
                >
                  {family.metiers - family.pourvues.length} autre
                  {family.metiers - family.pourvues.length > 1 ? "s" : ""} métier
                  {family.metiers - family.pourvues.length > 1 ? "s" : ""} dans cette famille
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
