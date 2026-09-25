import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Ce qui empêche un compte d'être supprimé.
 *
 * ⚠️ **Cette lecture ne décide rien.** Elle sert à dire *avant* le geste ce
 * qui coince et comment le débloquer. `delete_my_account` refait tous les
 * contrôles pour son propre compte : un écran qui n'affiche aucun blocage
 * n'est pas une autorisation, seulement une information à l'instant où il a
 * été rendu.
 *
 * Les libellés viennent de la base et non d'ici : ce sont les mêmes que ceux
 * que la fonction de suppression renvoie en cas de refus. Les dédoubler aurait
 * garanti qu'ils divergent.
 */

export interface DeletionBlocker {
  code: string;
  reason: string;
}

export async function getDeletionBlockers(): Promise<DeletionBlocker[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("account_deletion_blockers");

  if (error) {
    // Ne pas laisser une lecture en échec ouvrir la porte : on présente un
    // blocage plutôt qu'un bouton, et on le dit.
    return [
      {
        code: "lecture_impossible",
        reason:
          "Nous n'arrivons pas à vérifier l'état de votre compte pour l'instant. " +
          "Réessayez dans un moment, ou écrivez-nous.",
      },
    ];
  }

  return (data ?? []).map((b) => ({ code: b.code ?? "", reason: b.reason ?? "" }));
}
