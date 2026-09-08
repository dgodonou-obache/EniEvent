import "leaflet/dist/leaflet.css";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <div className="flex-1 bg-slate-50">{children}</div>
      <PublicFooter />
    </div>
  );
}
