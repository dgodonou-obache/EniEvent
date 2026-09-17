import { AccessDenied } from "@/components/auth/AccessDenied";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { identityOf, requireSpace } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { context, decision } = await requireSpace("admin");

  if (!decision.granted) {
    return <AccessDenied reason={decision.reason} space="admin" />;
  }

  return (
    <DashboardShell space="admin" identity={identityOf(context)}>
      {children}
    </DashboardShell>
  );
}
