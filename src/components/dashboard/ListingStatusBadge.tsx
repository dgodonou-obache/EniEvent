import { Badge } from "@/components/ui/badge";

type Status = "draft" | "pending" | "approved" | "rejected" | "archived";

/**
 * État d'une annonce, dit en clair.
 *
 * « approved » et « pending » sont des mots de développeur : le partenaire veut
 * savoir si son annonce est visible, pas dans quel état de la machine elle se
 * trouve. La mise en pause est un état distinct de la modération — d'où le
 * paramètre séparé.
 */
export function ListingStatusBadge({ status, isPaused }: { status: Status; isPaused: boolean }) {
  if (status === "approved" && isPaused) {
    return <Badge variant="warning">En pause</Badge>;
  }

  switch (status) {
    case "approved":
      return <Badge variant="success">En ligne</Badge>;
    case "pending":
      return <Badge variant="warning">En cours de vérification</Badge>;
    case "rejected":
      return <Badge variant="destructive">À corriger</Badge>;
    case "archived":
      return <Badge variant="outline">Archivée</Badge>;
    default:
      return <Badge variant="secondary">Brouillon</Badge>;
  }
}
