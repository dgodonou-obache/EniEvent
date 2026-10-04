import "leaflet/dist/leaflet.css";

import { SessionTimeout } from "@/components/auth/SessionTimeout";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { headerAccount } from "@/lib/auth/header";

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const account = await headerAccount();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Entretien seul, sans fenêtre : lire une fiche un quart d'heure n'est
          pas de l'inactivité, et le proxy ne déroute pas la navigation hors
          d'un espace protégé. Sans cela, le délai court déconnecterait au
          moment précis du clic sur « Réserver ». */}
      {account ? <SessionTimeout /> : null}

      <PublicHeader account={account} />
      <div className="flex-1 bg-slate-50">{children}</div>
      <PublicFooter account={account} />
    </div>
  );
}
