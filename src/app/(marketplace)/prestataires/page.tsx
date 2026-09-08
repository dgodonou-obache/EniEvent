import { CatalogPage } from "@/components/marketplace/CatalogPage";

export const metadata = {
  title: "Prestataires événementiels au Bénin",
  description:
    "Traiteurs, décorateurs, DJ, maîtres de cérémonie, location d'équipement et animation traditionnelle à Cotonou, Porto-Novo et partout au Bénin.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CatalogPage
      title="Prestataires événementiels"
      intro="Traiteurs, décoration, sonorisation, maîtres de cérémonie, location de matériel : tous les métiers qui font un événement réussi."
      kind="service"
      pathname="/prestataires"
      searchParams={await searchParams}
    />
  );
}
