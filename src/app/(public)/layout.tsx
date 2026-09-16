import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { headerAccount } from "@/lib/auth/header";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Lu ici, côté serveur : l'en-tête est un composant client et ne peut pas
  // interroger la session lui-même sans un aller-retour visible à l'écran.
  const account = await headerAccount();

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader account={account} />
      <div className="flex-1">{children}</div>
      <PublicFooter account={account} />
    </div>
  );
}
