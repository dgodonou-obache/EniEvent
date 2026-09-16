import { UpcomingPage } from "@/components/dashboard/UpcomingPage";

/**
 * Route attrape-tout de l'espace particulier.
 *
 * Six des huit onglets renvoyaient un 404 — « This page could not be found »
 * en plein espace client, ce qui fait douter du site entier. Une page qui
 * nomme l'onglet et le lot à venir se comprend.
 *
 * Une page réelle placée à `/compte/reservations` primera automatiquement sur
 * celle-ci : Next résout toujours la route la plus spécifique en premier.
 */
export default async function AccountUpcomingPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  return <UpcomingPage space="account" segments={segments} basePath="/compte" />;
}
