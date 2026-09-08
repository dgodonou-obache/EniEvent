import Link from "next/link";

// Comme dans l'en-tête : uniquement les routes construites. Les pages
// éditoriales et légales viendront avec leur lot, et reprendront leur place ici.
const COLUMNS = [
  {
    title: "Découvrir",
    links: [
      { href: "/lieux", label: "Lieux" },
      { href: "/prestataires", label: "Prestataires" },
      { href: "/categories", label: "Catégories" },
      { href: "/recherche", label: "Rechercher" },
    ],
  },
  {
    title: "Mon compte",
    links: [
      { href: "/connexion", label: "Connexion" },
      { href: "/inscription", label: "Créer un compte" },
      { href: "/compte", label: "Mes réservations" },
    ],
  },
  {
    title: "Partenaires",
    links: [
      { href: "/pro/inscription", label: "Devenir partenaire" },
      { href: "/pro/connexion", label: "Espace partenaire" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="text-xl font-bold tracking-tight text-slate-900">
              <span className="text-orange-500">Éni</span>Event
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Lieux et prestataires événementiels au Bénin.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="micro-label text-slate-400">{column.title}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-600 transition-colors duration-200 hover:text-orange-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} ÉniEvent. Tous droits réservés.
          </p>
          {/* Les pages légales (CGU, CGV, confidentialité) arrivent au lot 8,
              avec la mise en production. */}
          <p className="text-xs text-slate-400">Cotonou, Bénin</p>
        </div>
      </div>
    </footer>
  );
}
