import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileCheck,
  FileText,
  Flag,
  FolderKanban,
  Gauge,
  Handshake,
  HelpCircle,
  Images,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Percent,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tags,
  ToggleLeft,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Par défaut un élément est actif sur sa route et ses sous-routes, pour que
   * `/pro/annonces/42` éclaire bien « Mes annonces ». Passer `exact` sur les
   * racines d'espace, sinon elles resteraient allumées partout.
   */
  exact?: boolean;
}

export interface NavSection {
  /** Absent pour le premier groupe, qui n'a pas besoin de titre. */
  title?: string;
  items: NavItem[];
}

export interface SpaceNav {
  brand: string;
  home: string;
  /** Destination après déconnexion — propre à chaque espace (règle d'isolation). */
  signOutTo: string;
  sections: NavSection[];
}

export type Space = "partner" | "company" | "admin" | "account";

/** Espace partenaire — /pro */
export const partnerNav: SpaceNav = {
  brand: "ÉniEvent Pro",
  home: "/pro/dashboard",
  signOutTo: "/pro/connexion",
  sections: [
    {
      items: [{ label: "Tableau de bord", href: "/pro/dashboard", icon: LayoutDashboard }],
    },
    {
      title: "Mon offre",
      items: [
        { label: "Mes annonces", href: "/pro/annonces", icon: Building2 },
        { label: "Planning & tarifs", href: "/pro/planning", icon: CalendarDays },
      ],
    },
    {
      title: "Activité",
      items: [
        { label: "Demandes reçues", href: "/pro/demandes", icon: ClipboardList },
        { label: "Mes devis", href: "/pro/devis", icon: FileText },
        { label: "Réservations", href: "/pro/reservations", icon: ShoppingBag },
      ],
    },
    {
      title: "Relation client",
      items: [
        { label: "Messages", href: "/pro/messages", icon: MessageSquare },
        { label: "Avis", href: "/pro/avis", icon: Star },
      ],
    },
    {
      title: "Finances",
      items: [
        { label: "Revenus", href: "/pro/finances/revenus", icon: BarChart3 },
        { label: "Versements", href: "/pro/finances/versements", icon: Banknote },
        { label: "Factures", href: "/pro/finances/factures", icon: Receipt },
        { label: "Commissions", href: "/pro/finances/commissions", icon: Percent },
      ],
    },
    {
      title: "Développement",
      items: [
        { label: "Promotions", href: "/pro/promotions", icon: Megaphone },
        { label: "Statistiques", href: "/pro/statistiques", icon: Gauge },
      ],
    },
    {
      title: "Mon compte",
      items: [
        { label: "Équipe", href: "/pro/equipe", icon: Users },
        { label: "Documents", href: "/pro/documents", icon: FileCheck },
        { label: "Paramètres", href: "/pro/parametres", icon: Settings },
        { label: "Aide & support", href: "/pro/support", icon: HelpCircle },
      ],
    },
  ],
};

/** Espace entreprise — /entreprise */
export const companyNav: SpaceNav = {
  brand: "ÉniEvent Entreprise",
  home: "/entreprise",
  signOutTo: "/connexion",
  sections: [
    {
      items: [{ label: "Tableau de bord", href: "/entreprise", icon: LayoutDashboard, exact: true }],
    },
    {
      title: "Événements",
      items: [
        { label: "Projets", href: "/entreprise/projets", icon: FolderKanban },
        { label: "Devis", href: "/entreprise/devis", icon: FileText },
        { label: "Réservations", href: "/entreprise/reservations", icon: ShoppingBag },
      ],
    },
    {
      title: "Pilotage budgétaire",
      items: [
        { label: "Budgets", href: "/entreprise/budgets", icon: Wallet },
        { label: "Validations", href: "/entreprise/validations", icon: BadgeCheck },
        { label: "Factures", href: "/entreprise/factures", icon: Receipt },
        { label: "Rapports", href: "/entreprise/rapports", icon: BarChart3 },
      ],
    },
    {
      title: "Organisation",
      items: [
        { label: "Fournisseurs", href: "/entreprise/fournisseurs", icon: Handshake },
        { label: "Équipe", href: "/entreprise/equipe", icon: Users },
        { label: "Paramètres", href: "/entreprise/parametres", icon: Settings },
      ],
    },
  ],
};

/** Back-office — /admin */
export const adminNav: SpaceNav = {
  brand: "ÉniEvent Admin",
  home: "/admin",
  signOutTo: "/connexion",
  sections: [
    {
      items: [{ label: "Vue d'ensemble", href: "/admin", icon: LayoutDashboard, exact: true }],
    },
    {
      title: "Modération",
      items: [
        { label: "Annonces à valider", href: "/admin/moderation", icon: ShieldCheck },
        { label: "Avis", href: "/admin/avis", icon: Star },
      ],
    },
    {
      title: "Comptes",
      items: [
        { label: "Partenaires", href: "/admin/partenaires", icon: Building2 },
        { label: "Entreprises", href: "/admin/entreprises", icon: Handshake },
        { label: "Utilisateurs", href: "/admin/utilisateurs", icon: Users },
      ],
    },
    {
      title: "Activité",
      items: [
        // Pas d'entrée « Projets » : dans le modèle de données, un projet **est**
        // une demande de devis — l'espace client l'appelle d'ailleurs `/projets`.
        // Deux entrées auraient affiché deux fois le même tableau.
        { label: "Demandes", href: "/admin/demandes", icon: ClipboardList },
        { label: "Réservations", href: "/admin/reservations", icon: ShoppingBag },
      ],
    },
    {
      title: "Finances",
      items: [
        { label: "Paiements", href: "/admin/paiements", icon: CreditCard },
        { label: "Versements", href: "/admin/versements", icon: Banknote },
        { label: "Remboursements", href: "/admin/remboursements", icon: Undo2 },
        { label: "Litiges", href: "/admin/litiges", icon: Scale },
        { label: "Commissions", href: "/admin/commissions", icon: Percent },
      ],
    },
    {
      title: "Contenu",
      items: [
        { label: "Catégories", href: "/admin/categories", icon: Tags },
        { label: "Villes", href: "/admin/villes", icon: MapPin },
        { label: "Pages & blog", href: "/admin/cms", icon: Newspaper },
        { label: "Médiathèque", href: "/admin/medias", icon: Images },
        { label: "Promotions", href: "/admin/promotions", icon: Megaphone },
      ],
    },
    {
      title: "Système",
      items: [
        { label: "Rapports", href: "/admin/rapports", icon: BarChart3 },
        { label: "Journal d'audit", href: "/admin/journal", icon: ScrollText },
        { label: "Feature flags", href: "/admin/feature-flags", icon: ToggleLeft },
        { label: "Signalements", href: "/admin/signalements", icon: Flag },
        { label: "Paramètres", href: "/admin/parametres", icon: Settings },
      ],
    },
  ],
};

/**
 * Menus par espace, résolus **dans le composant client**.
 *
 * Un `NavItem` porte un composant d'icône, c'est-à-dire une fonction : le
 * passer d'un composant serveur à un composant client ferait échouer la
 * sérialisation RSC et rendrait tout le back-office indisponible. Le layout
 * serveur ne transmet donc que le nom de l'espace, et la barre latérale va
 * chercher son menu ici.
 */
/**
 * Espace particulier — /compte
 *
 * Le seul espace dont le menu s'affiche en onglets horizontaux plutôt qu'en
 * barre latérale : un particulier a peu d'écrans, et le défilement horizontal
 * passe mieux au pouce. Il figure ici malgré tout, pour que les écrans
 * d'attente et le contrôle des liens morts le couvrent comme les autres.
 */
export const accountNav: SpaceNav = {
  brand: "ÉniEvent",
  home: "/compte",
  signOutTo: "/",
  sections: [
    {
      items: [
        { label: "Aperçu", href: "/compte", icon: LayoutDashboard, exact: true },
        { label: "Réservations", href: "/compte/reservations", icon: ShoppingBag },
        { label: "Projets", href: "/projets", icon: FolderKanban },
        { label: "Messages", href: "/compte/messages", icon: MessageSquare },
        { label: "Favoris", href: "/compte/favoris", icon: Star },
        { label: "Paiements", href: "/compte/paiements", icon: CreditCard },
        { label: "Documents", href: "/compte/documents", icon: FileText },
        { label: "Profil", href: "/compte/profil", icon: Settings },
      ],
    },
  ],
};

export const NAV_BY_SPACE: Record<Space, SpaceNav> = {
  partner: partnerNav,
  company: companyNav,
  admin: adminNav,
  account: accountNav,
};
