"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, X } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NAV_BY_SPACE, type NavItem, type NavSection, type Space } from "./nav-config";

export interface SidebarIdentity {
  /** Raison sociale du partenaire, nom de l'entreprise, ou nom de l'agent. */
  name: string;
  email: string;
}

interface SidebarProps {
  space: Space;
  identity: SidebarIdentity;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

/**
 * Navigation latérale commune aux trois back-offices (partenaire, entreprise,
 * admin). Ce qui change d'un espace à l'autre tient entièrement dans son menu.
 *
 * Le menu est résolu ici et non reçu en propriété : ses icônes sont des
 * fonctions, que la frontière serveur → client ne sait pas sérialiser.
 *
 * Conformément à la règle héritée de la v1, elle ne contient aucun lien
 * « retour au site » et n'affiche l'identité de l'utilisateur qu'une seule fois.
 *
 * Les espaces marqués `collapsible` replient leurs sections (voir `nav-config`).
 * L'état d'ouverture **se déduit du chemin** plutôt que de se conserver : la
 * section de la page en cours est toujours ouverte, donc un rechargement
 * retombe au bon endroit sans qu'on ait à stocker quoi que ce soit. Un choix
 * manuel tient le temps de la visite et n'est jamais défait sous le doigt —
 * l'ouverture automatique ne se déclenche qu'à un **changement** de page.
 */
export function Sidebar({ space, identity, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const nav = NAV_BY_SPACE[space];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  /**
   * Une section n'est repliable que si elle porte un titre : le premier groupe
   * n'en a pas, et c'est lui qui mène au tableau de bord.
   */
  const sectionKey = (section: NavSection, index: number) => section.title ?? `groupe-${index}`;
  const repliable = (section: NavSection) => Boolean(nav.collapsible && section.title);

  const sectionActive = nav.sections.find(
    (section) => repliable(section) && section.items.some(isActive),
  );
  const cleActive = sectionActive?.title;

  const [ouvertes, setOuvertes] = React.useState<string[]>(() => (cleActive ? [cleActive] : []));

  /**
   * Ouvrir la section d'arrivée **à la navigation seulement**. Sans ce
   * garde-fou, une section repliée à la main se rouvrirait au rendu suivant et
   * le menu refuserait de se laisser ranger.
   *
   * ⚠️ L'ajustement se fait **pendant le rendu**, pas dans un effet : React
   * reprend alors la passe avant de peindre, là où un effet afficherait
   * d'abord la section fermée puis la rouvrirait sous les yeux. Le compilateur
   * React refuse d'ailleurs explicitement le `setState` en corps d'effet
   * (`react-hooks/set-state-in-effect`).
   */
  const [chemin, setChemin] = React.useState(pathname);
  if (chemin !== pathname) {
    setChemin(pathname);
    if (cleActive && !ouvertes.includes(cleActive)) setOuvertes([...ouvertes, cleActive]);
  }

  const basculer = (cle: string) =>
    setOuvertes((liste) =>
      liste.includes(cle) ? liste.filter((autre) => autre !== cle) : [...liste, cle],
    );

  return (
    <>
      {isMobileOpen ? (
        <div
          aria-hidden
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-100 bg-white transition-transform duration-300 lg:static lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center border-b border-slate-100 px-6">
          <Link
            href={nav.home}
            className="flex items-center text-xl font-bold tracking-tight text-slate-900"
          >
            <span className="text-orange-500">Éni</span>
            {nav.brand.replace(/^ÉniEvent/, "Event")}
          </Link>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Fermer le menu"
            className="ml-auto lg:hidden"
            onClick={onMobileClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        <nav
          className={cn(
            "no-scrollbar flex-1 overflow-y-auto px-4 py-5",
            nav.collapsible ? "space-y-2" : "space-y-6",
          )}
        >
          {nav.sections.map((section, index) => {
            const cle = sectionKey(section, index);
            const plie = repliable(section);
            const ouverte = !plie || ouvertes.includes(cle);
            // Une section refermée à la main peut contenir la page en cours : on
            // garde alors un repère, sans quoi « où suis-je » disparaîtrait.
            const porteLActif = plie && !ouverte && section.items.some(isActive);

            return (
              <div key={cle}>
                {plie ? (
                  <button
                    type="button"
                    onClick={() => basculer(cle)}
                    aria-expanded={ouverte}
                    aria-controls={`menu-${space}-${index}`}
                    className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-left transition-all duration-200 hover:bg-orange-50 active:scale-[0.98]"
                  >
                    <span
                      className={cn(
                        "micro-label flex-1 truncate transition-all duration-200",
                        porteLActif ? "text-orange-600" : "text-slate-400",
                      )}
                    >
                      {section.title}
                    </span>

                    {porteLActif ? (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                      />
                    ) : null}

                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                        ouverte && "rotate-180",
                      )}
                    />
                  </button>
                ) : section.title ? (
                  <p className="micro-label mb-2 px-4 text-slate-400">{section.title}</p>
                ) : null}

                {ouverte ? (
                  <div
                    id={plie ? `menu-${space}-${index}` : undefined}
                    className={cn("space-y-1", plie && "mt-1 pb-1")}
                  >
                    {section.items.map((item) => {
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={onMobileClose}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                            active
                              ? "bg-orange-50 text-orange-600"
                              : "text-slate-600 hover:translate-x-1 hover:bg-orange-50 hover:text-orange-600",
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-100 bg-slate-50/50 p-3">
          <div className="flex w-full items-center gap-3 rounded-xl px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
              {identity.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{identity.name}</p>
              <p className="truncate text-[11px] text-slate-500">{identity.email}</p>
            </div>
          </div>

          <form action={signOut.bind(null, nav.signOutTo)}>
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
