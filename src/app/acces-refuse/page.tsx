import { AccessDenied } from "@/components/auth/AccessDenied";
import { DENIAL_REASONS, SPACES, type DenialReason, type Space } from "@/lib/auth/access";

export const metadata = { title: "Accès refusé" };

/**
 * Écran de refus servi **par réécriture**, depuis le proxy.
 *
 * Pourquoi ne pas laisser le layout d'espace s'en charger, comme avant : dans
 * l'App Router, page et layout se rendent **en parallèle**. Un layout qui
 * renvoie un refus au lieu de ses enfants empêche l'affichage, mais **pas
 * l'exécution de la page** — ses requêtes partent, et son rendu se retrouve
 * dans la charge RSC du document.
 *
 * Aucune donnée ne fuyait pour autant : la page s'exécutait avec les droits du
 * visiteur, donc la RLS filtrait. Mais la première page d'administration qui
 * emploierait la clé de service ou une fonction `SECURITY DEFINER` aurait, elle,
 * fuité pour de bon. La réécriture coupe le mal à la racine : la page ne
 * s'exécute jamais.
 *
 * L'URL reste celle demandée — une réécriture ne redirige pas — ce qui évite
 * de faire croire à une session expirée.
 */
export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ espace?: string; motif?: string }>;
}) {
  const { espace, motif } = await searchParams;

  // Les deux valeurs viennent de l'URL : on ne fait confiance qu'à ce qui
  // appartient aux énumérations connues.
  const space: Space = (SPACES as readonly string[]).includes(espace ?? "")
    ? (espace as Space)
    : "admin";

  const reason: DenialReason = (DENIAL_REASONS as readonly string[]).includes(motif ?? "")
    ? (motif as DenialReason)
    : "not-admin";

  return <AccessDenied reason={reason} space={space} />;
}
