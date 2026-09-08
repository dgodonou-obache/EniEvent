import { UpcomingPage } from "@/components/dashboard/UpcomingPage";

/**
 * Route attrape-tout de l'espace partenaire.
 *
 * Une page réelle placée à `/pro/annonces` primera automatiquement sur celle-ci :
 * Next résout toujours la route la plus spécifique en premier. Aucun fichier à
 * supprimer au fil des lots.
 */
export default async function PartnerUpcomingPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  return <UpcomingPage space="partner" segments={segments} basePath="/pro" />;
}
