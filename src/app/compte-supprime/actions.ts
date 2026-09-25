"use server";

import { redirect } from "next/navigation";

import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/validation/account";
import { createClient } from "@/utils/supabase/server";

/**
 * Supprimer son compte.
 *
 * ⚠️ **Aucun identifiant n'est transmis.** `delete_my_account()` ne prend
 * aucun paramètre et agit sur `auth.uid()` : il n'y a pas de cible à garder,
 * donc pas de porte à surveiller. Un identifiant en argument aurait été une
 * vulnérabilité à contrôler à chaque relecture.
 *
 * ⚠️ **On ne fait pas confiance à l'écran.** Il affiche les blocages, mais la
 * personne a pu ouvrir la page hier et réserver depuis un autre onglet. La
 * base refait tous les contrôles, et son refus remonte ici en clair — ces
 * messages sont écrits pour être lus.
 */

export interface DeleteAccountState {
  error?: string;
}

/**
 * ⚠️ **Le mot à saisir vit dans `@/lib/validation/account`, pas ici.** Un
 * fichier `"use server"` ne peut exporter que des fonctions asynchrones : une
 * constante y est retirée du module servi au navigateur, et le composant
 * client qui l'importe échoue à l'exécution. Constaté en rendant réellement
 * `/compte/profil` — ni `tsc` ni `eslint` ne le voient.
 */
export async function deleteMyAccount(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const saisie = String(formData.get("confirmation") ?? "").trim();

  if (saisie !== DELETE_ACCOUNT_CONFIRMATION) {
    return { error: `Saisissez « ${DELETE_ACCOUNT_CONFIRMATION} » pour confirmer.` };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Votre session a expiré. Reconnectez-vous." };

  const { data: regime, error } = await supabase.rpc("delete_my_account");

  if (error) return { error: error.message };

  // La session doit tomber : le compte est mort, mais le jeton en cours, lui,
  // resterait valide jusqu'à son expiration. La base le refuserait — autant
  // ne pas laisser l'utilisateur buter dessus.
  await supabase.auth.signOut();

  // Le régime appliqué est dit à la personne : « effacé » et « anonymisé » ne
  // recouvrent pas la même chose, et elle a le droit de savoir ce qui reste.
  redirect(`/compte-supprime?regime=${regime === "efface" ? "efface" : "anonymise"}`);
}
