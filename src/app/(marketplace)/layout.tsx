import "leaflet/dist/leaflet.css";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { headerAccount } from "@/lib/auth/header";

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const account = await headerAccount();

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader account={account} />
      <div className="flex-1 bg-slate-50">{children}</div>
      <PublicFooter />
    </div>
  );
}
