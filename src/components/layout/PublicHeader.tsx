"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HeaderAccount } from "@/lib/auth/home";
import { cn } from "@/lib/utils";

// Seules les routes réellement construites figurent ici : un lien mort fait
// douter de l'installation, un lien absent se comprend. Les autres reviendront
// au fil des lots (packs, entreprises, « comment ça marche »).
const LINKS = [
  { href: "/lieux", label: "Lieux" },
  { href: "/prestataires", label: "Prestataires" },
  { href: "/categories", label: "Catégories" },
  { href: "/demande-de-devis", label: "Demander des devis" },
];

/**
 * `account` vaut `null` pour un visiteur. Sans lui, l'en-tête affichait
 * « Connexion / Inscription » à un client déjà connecté : revenu sur l'accueil
 * depuis son espace, il croyait sa session perdue.
 *
 * Un objet nu, jamais une fonction : la sérialisation serveur → client
 * échouerait à l'exécution seulement (`CLAUDE.md` §6).
 */
export function PublicHeader({ account = null }: { account?: HeaderAccount | null }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const close = React.useCallback(() => setIsOpen(false), []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Le clic sur le logo referme le menu mobile (comportement hérité de la v1). */}
        <Link
          href="/"
          onClick={close}
          className="text-xl font-bold tracking-tight text-slate-900"
        >
          <span className="text-orange-500">Éni</span>Event
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {/* L'inscription partenaire vit dans l'espace `/pro`, qui porte sa
              propre connexion : on y envoie directement, comme le pied de page.
              Inutile de la proposer à quelqu'un de déjà connecté. */}
          {account ? null : (
            <Link href="/pro/inscription">
              <Button variant="ghost" size="sm">
                Devenir partenaire
              </Button>
            </Link>
          )}
          {account ? (
            <Link href={account.href}>
              <Button size="sm">
                <UserRound className="h-4 w-4" aria-hidden />
                {account.name}
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/connexion">
                <Button variant="outline" size="sm">
                  Connexion
                </Button>
              </Link>
              <Link href="/inscription">
                <Button size="sm">Inscription</Button>
              </Link>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden"
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </Button>
      </div>

      <div
        className={cn(
          "border-t border-slate-100 bg-white lg:hidden",
          isOpen ? "block animate-fade-in" : "hidden",
        )}
      >
        <nav className="space-y-1 px-4 py-4">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="block rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.98]"
            >
              {link.label}
            </Link>
          ))}

          {/* Les actions de compte restent près des liens : atteignables au pouce. */}
          <div className="grid gap-2 pt-3">
            {account ? (
              <Link href={account.href} onClick={close}>
                <Button className="w-full">
                  <UserRound className="h-4 w-4" aria-hidden />
                  {account.name}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/connexion" onClick={close}>
                  <Button variant="outline" className="w-full">
                    Connexion
                  </Button>
                </Link>
                <Link href="/inscription" onClick={close}>
                  <Button className="w-full">Inscription</Button>
                </Link>
                <Link href="/pro/inscription" onClick={close}>
                  <Button variant="ghost" className="w-full">
                    Devenir partenaire
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
