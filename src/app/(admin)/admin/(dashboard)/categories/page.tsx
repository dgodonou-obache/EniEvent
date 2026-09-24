import { ReferenceManager } from "@/components/admin/ReferenceManager";
import { getAdminCategories } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

import { createCategory, renameCategory, toggleCategory } from "./actions";

/**
 * Le référentiel des métiers.
 *
 * **Masquer une catégorie ne retire pas ses annonces.** Elle disparaît des
 * filtres et de la page `/categories` ; les annonces déjà publiées restent en
 * ligne et réservables. C'est voulu : un partenaire ne doit pas perdre sa
 * vitrine parce qu'on réorganise un référentiel.
 *
 * L'accueil, lui, ne montre déjà que les familles pourvues — une catégorie
 * vide n'y apparaît pas, active ou non (règle §5 : ne pas promettre ce qui
 * n'existe pas).
 */

export const metadata = { title: "Catégories" };

const TYPES = [
  { value: "venue", label: "Lieu" },
  { value: "service", label: "Prestation" },
];

export default async function AdminCategoriesPage() {
  await requireUser("/admin/connexion");

  const categories = await getAdminCategories();

  const actives = categories.filter((c) => c.isActive).length;
  const vides = categories.filter((c) => c.isActive && c.listingCount === 0).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catégories</h1>
        <p className="mt-1 text-sm text-slate-500">
          {categories.length} au référentiel · {actives} proposée{actives > 1 ? "s" : ""}
          {vides > 0 ? ` · ${vides} sans aucune annonce` : ""}
        </p>
      </div>

      {vides > 0 ? (
        <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          <strong>
            {vides} catégorie{vides > 1 ? "s" : ""} active{vides > 1 ? "s" : ""} sans annonce.
          </strong>{" "}
          Elles restent dans le référentiel complet, mais l&apos;accueil ne les montre pas : il ne
          met en avant que les familles réellement pourvues.
        </p>
      ) : null}

      <ReferenceManager
        items={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          isActive: c.isActive,
          listingCount: c.listingCount,
          meta: c.kind === "venue" ? "Lieu" : "Prestation",
        }))}
        createAction={createCategory}
        renameAction={renameCategory}
        toggleAction={toggleCategory}
        extraField={{ name: "kind", label: "Type", options: TYPES }}
        addLabel="Ajouter une catégorie"
        renameWarning="L'adresse publique ne change pas : les liens déjà partagés et indexés continuent de fonctionner."
      />
    </div>
  );
}
