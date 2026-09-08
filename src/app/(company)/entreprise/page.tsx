import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";

export const metadata = { title: "Tableau de bord" };

export default function CompanyDashboardPage() {
  return (
    <PlaceholderPage
      title="Tableau de bord"
      lot="Lot 5 — Espace entreprise"
      description="Dépenses engagées, événements à venir, demandes de devis en cours et économies réalisées."
    />
  );
}
