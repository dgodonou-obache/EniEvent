"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NAV_BY_SPACE, type NavItem, type Space } from "./nav-config";

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
 */
export function Sidebar({ space, identity, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const nav = NAV_BY_SPACE[space];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

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

        <nav className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {nav.sections.map((section, index) => (
            <div key={section.title ?? `section-${index}`}>
              {section.title ? (
                <p className="micro-label mb-2 px-4 text-slate-400">{section.title}</p>
              ) : null}

              <div className="space-y-1">
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
            </div>
          ))}
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
