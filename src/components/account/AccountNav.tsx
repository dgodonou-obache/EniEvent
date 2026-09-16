"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { accountNav } from "@/components/dashboard/nav-config";
import { cn } from "@/lib/utils";

/**
 * Une seule source de vérité : `nav-config`. Cette liste vivait ici en double,
 * hors de portée du contrôle des liens morts — et six de ses huit entrées
 * renvoyaient un 404 sans que rien ne le signale.
 */
const LINKS = accountNav.sections.flatMap((section) => section.items);

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
