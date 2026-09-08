import { UpcomingPage } from "@/components/dashboard/UpcomingPage";

export default async function AdminUpcomingPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  return <UpcomingPage space="admin" segments={segments} basePath="/admin" />;
}
