import { ReferenceManager } from "@/components/admin/ReferenceManager";
import { getAdminCities } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

import { createCity, renameCity, toggleCity } from "./actions";

/**
 * Le référentiel des villes.
 *
 * ⚠️ **Une annonce porte le nom de sa ville en texte, pas une clé étrangère.**
 * Renommer une ville sans déplacer ses annonces les détacherait du filtre sans
 * qu'aucune erreur ne le signale. `renameCity` fait donc les deux dans la même
 * action, et l'écran l'annonce **avant** le geste — pas après.
 *
 * Le pays reste le Bénin. Le schéma est multi-pays (`cities.country`), mais
 * ouvrir un pays voisin demandera des données et une décision, pas un champ de
 * formulaire de plus.
 */

export const metadata = { title: "Villes" };

export default async function AdminCitiesPage() {
  await requireUser("/admin/connexion");

  const cities = await getAdminCities();

  const actives = cities.filter((c) => c.isActive).length;
  const pourvues = cities.filter((c) => c.listingCount > 0).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Villes</h1>
        <p className="mt-1 text-sm text-slate-500">
          {cities.length} au Bénin · {actives} proposée{actives > 1 ? "s" : ""} · {pourvues} avec au
          moins une annonce
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Renommer une ville déplace aussi ses annonces.</strong> Les annonces portent le nom
        de leur ville en toutes lettres et non une référence : sans ce déplacement, elles
        resteraient rattachées à un nom disparu et sortiraient des résultats de recherche sans que
        rien ne le signale.
      </p>

      <ReferenceManager
        items={cities.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          isActive: c.isActive,
          listingCount: c.listingCount,
          meta: c.region,
        }))}
        createAction={createCity}
        renameAction={renameCity}
        toggleAction={toggleCity}
        extraField={{ name: "region", label: "Département" }}
        addLabel="Ajouter une ville"
        renameWarning="Les annonces rattachées à cette ville seront déplacées dans la même opération. Leur nombre vous sera confirmé."
      />
    </div>
  );
}
