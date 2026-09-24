import { ToggleLeft } from "lucide-react";

import { FlagSwitches } from "@/components/admin/FlagSwitches";
import { EmptyState } from "@/components/ui/empty-state";
import { getFeatureFlags } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

/**
 * Les interrupteurs d'exploitation.
 *
 * ⚠️ **Un interrupteur qui ne commande rien est pire que pas d'interrupteur.**
 * L'exploitant le bascule, croit avoir agi, et le produit continue comme
 * avant — jusqu'à ce qu'il s'en aperçoive par une réclamation. Chaque clé
 * présentée ici est donc **obéie en base**, par un déclencheur, et non dans
 * une Server Action qu'un appel direct contournerait :
 *
 *   `inscriptions_partenaires` → déclencheur sur `organizations`
 *   `messagerie`               → déclencheurs sur `conversations` et `messages`
 *
 * En ajouter un demande d'écrire d'abord l'endroit qui lui obéit. La liste est
 * donc courte, et c'est un choix, pas un manque.
 */

export const metadata = { title: "Interrupteurs" };

export default async function AdminFlagsPage() {
  await requireUser("/admin/connexion");

  const flags = await getFeatureFlags();
  const coupes = flags.filter((f) => !f.enabled);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Interrupteurs</h1>
        <p className="mt-1 text-sm text-slate-500">
          {coupes.length === 0
            ? "Tout est en service."
            : `${coupes.length} fonctionnalité${coupes.length > 1 ? "s coupées" : " coupée"}.`}{" "}
          Les coupures prennent effet immédiatement, pour tout le monde.
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Ces interrupteurs agissent en base de données</strong>, pas seulement dans
        l&apos;interface : couper la messagerie la coupe aussi pour un appel qui n&apos;emprunte
        aucun écran. Les données déjà écrites restent lisibles — une coupure empêche d&apos;écrire,
        elle n&apos;efface rien.
      </p>

      {coupes.length > 0 ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">
            {coupes.length === 1
              ? `« ${coupes[0].label} » est coupé.`
              : `${coupes.length} fonctionnalités sont coupées.`}
          </span>{" "}
          Une coupure est faite pour être temporaire : pensez à rallumer quand la raison a disparu.
        </p>
      ) : null}

      {flags.length === 0 ? (
        <EmptyState
          icon={ToggleLeft}
          title="Aucun interrupteur"
          description="Ils se déclarent en migration, avec l'endroit du code qui leur obéit."
        />
      ) : (
        <FlagSwitches flags={flags} />
      )}
    </div>
  );
}
