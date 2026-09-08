import { CatalogPage } from "@/components/marketplace/CatalogPage";

export const metadata = {
  title: "Salles et lieux de réception au Bénin",
  description:
    "Salles de réception, villas, jardins, rooftops et espaces de séminaire à Cotonou, Porto-Novo, Abomey-Calavi, Ouidah et Grand-Popo.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VenuesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CatalogPage
      title="Salles et lieux de réception"
      intro="Salles climatisées, villas en bord de mer, jardins et espaces de séminaire — avec leurs capacités, leurs équipements et leurs disponibilités réelles."
      kind="venue"
      pathname="/lieux"
      searchParams={await searchParams}
    />
  );
}
