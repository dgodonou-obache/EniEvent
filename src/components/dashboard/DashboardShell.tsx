"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Sidebar, type SidebarIdentity } from "./Sidebar";
import { NAV_BY_SPACE, type Space } from "./nav-config";

interface DashboardShellProps {
  /**
   * Nom de l'espace, et non son menu : les icônes de navigation sont des
   * fonctions, qu'un composant serveur ne peut pas transmettre à un composant
   * client. Le menu est résolu de ce côté-ci de la frontière.
   */
  space: Space;
  identity: SidebarIdentity;
  children: React.ReactNode;
}

/**
 * Coquille des back-offices : navigation latérale fixe en desktop, tiroir en
 * mobile. L'identité est fournie par le layout serveur — pas de requête côté
 * client, donc pas de « Chargement… » dans la barre latérale.
 */
export function DashboardShell({ space, identity, children }: DashboardShellProps) {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const closeMobile = React.useCallback(() => setIsMobileOpen(false), []);
  const nav = NAV_BY_SPACE[space];

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <Sidebar
        space={space}
        identity={identity}
        isMobileOpen={isMobileOpen}
        onMobileClose={closeMobile}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-slate-100 bg-white px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ouvrir le menu"
            aria-expanded={isMobileOpen}
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            <span className="text-orange-500">Éni</span>
            {nav.brand.replace(/^ÉniEvent/, "Event")}
          </span>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
