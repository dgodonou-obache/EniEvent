import { AccessDenied } from "@/components/auth/AccessDenied";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { identityOf, requireSpace } from "@/lib/auth/session";

export default async function PartnerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { context, decision } = await requireSpace("partner", "/pro/connexion");

  if (!decision.granted) {
    return <AccessDenied reason={decision.reason} space="partner" />;
  }

  return (
    <DashboardShell space="partner" identity={identityOf(context, decision.org?.orgName)}>
      {children}
    </DashboardShell>
  );
}
