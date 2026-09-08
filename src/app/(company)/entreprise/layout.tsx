import { AccessDenied } from "@/components/auth/AccessDenied";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { identityOf, requireSpace } from "@/lib/auth/session";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const { context, decision } = await requireSpace("company");

  if (!decision.granted) {
    return <AccessDenied reason={decision.reason} space="company" />;
  }

  return (
    <DashboardShell space="company" identity={identityOf(context, decision.org?.orgName)}>
      {children}
    </DashboardShell>
  );
}
