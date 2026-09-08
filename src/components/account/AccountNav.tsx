"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/compte", label: "Aperçu", exact: true },
  { href: "/compte/reservations", label: "Réservations" },
  { href: "/projets", label: "Projets" },
  { href: "/compte/messages", label: "Messages" },
  { href: "/compte/favoris", label: "Favoris" },
  { href: "/compte/paiements", label: "Paiements" },
  { href: "/compte/documents", label: "Documents" },
  { href: "/compte/profil", label: "Profil" },
];

/**
 * Navigation du compte particulier. Onglets horizontaux plutôt qu'une barre
 * latérale : un particulier a peu d'écrans, et le défilement horizontal passe
 * mieux sur mobile qu'un tiroir.
 */
export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-slate-100 pb-px">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-all duration-200",
                  active
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-slate-500 hover:text-orange-600",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
