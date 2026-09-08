import { UpcomingPage } from "@/components/dashboard/UpcomingPage";

export default async function CompanyUpcomingPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  return <UpcomingPage space="company" segments={segments} basePath="/entreprise" />;
}
