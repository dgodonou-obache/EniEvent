"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Lock, Trash2 } from "lucide-react";

import { deleteMyAccount, type DeleteAccountState } from "@/app/compte-supprime/actions";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/validation/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeletionBlocker } from "@/lib/account-deletion";

/**
 * Supprimer son compte.
 *
 * **Ce qui empêche de partir se dit avant, pas après.** Un bouton qui refuse
 * au moment du clic laisse croire à un piège ; la liste des raisons, affichée
 * d'emblée, dit quoi faire pour se débloquer. Chaque raison vient de la base :
 * ce sont exactement les mêmes phrases que le refus, dédoubler les libellés
 * aurait garanti qu'ils divergent.
 *
 * ⚠️ **Un second clic ne suffit pas.** Le geste est immédiat et sans retour :
 * il demande d'écrire un mot. C'est la seule friction du dépôt de ce niveau,
 * et elle est proportionnée — une annulation de réservation se rattrape par un
 * appel, la suppression d'un compte non.
 *
 * **On dit ce qui survit.** Prétendre tout effacer serait faux : les pièces
 * comptables d'une transaction restent, et elles appartiennent aussi au
 * partenaire. Le dire d'avance vaut mieux que de le découvrir après.
 */

export function DeleteAccount({ blockers }: { blockers: DeletionBlocker[] }) {
  const [state, action, pending] = React.useActionState<DeleteAccountState, FormData>(
    deleteMyAccount,
    {},
  );
  const [ouvert, setOuvert] = React.useState(false);

  const bloque = blockers.length > 0;

  return (
    <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5">
      <h2 className="font-bold text-slate-900">Supprimer mon compte</h2>

      {bloque ? (
        <>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Votre compte ne peut pas être supprimé pour l&apos;instant.
          </p>

          <ul className="mt-3 space-y-2">
            {blockers.map((b) => (
              <li
                key={b.code}
                className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {b.reason}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Ces conditions existent pour que personne ne se retrouve sans interlocuteur — ni un
            client qui attend une prestation, ni nous quand nous vous devons de l&apos;argent.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Votre compte peut être supprimé. C&apos;est immédiat et sans retour.
          </p>

          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <strong>Ce qui disparaît :</strong> votre nom, votre téléphone, votre adresse e-mail,
            vos favoris et vos messages.
            <br />
            <strong>Ce qui reste :</strong> si vous avez déjà réservé ou reçu un devis, les pièces
            de ces transactions sont conservées sans votre nom. Elles ne sont pas seulement les
            vôtres — un prestataire en a besoin pour sa comptabilité, comme vous pour la vôtre.
          </p>

          {ouvert ? (
            <form action={action} className="mt-4">
              <label
                htmlFor="confirmation"
                className="block text-xs font-semibold text-slate-700"
              >
                Écrivez « {DELETE_ACCOUNT_CONFIRMATION} » pour confirmer
              </label>
              <Input
                id="confirmation"
                name="confirmation"
                required
                autoComplete="off"
                placeholder={DELETE_ACCOUNT_CONFIRMATION}
                className="mt-1.5 sm:max-w-xs"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Suppression…
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                      Supprimer définitivement
                    </>
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
                  Annuler
                </Button>
              </div>

              {state.error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900"
                >
                  {state.error}
                </p>
              ) : null}
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOuvert(true)}
              className="mt-4 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Supprimer mon compte
            </Button>
          )}
        </>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Après suppression, votre adresse e-mail redevient libre : une nouvelle inscription
        repartira d&apos;une page blanche, sans lien avec cet ancien compte.
      </p>
    </section>
  );
}
