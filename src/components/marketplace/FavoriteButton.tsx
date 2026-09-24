"use client";

import * as React from "react";
import { Heart } from "lucide-react";

import { toggleFavorite, type FavoriteState } from "@/app/(account)/compte/favoris/actions";
import { cn } from "@/lib/utils";

/**
 * Le cœur, sur une carte ou une fiche d'annonce.
 *
 * ⚠️ **Aucun compteur, jamais.** Ce bouton ne dit pas combien de personnes ont
 * mis l'annonce de côté : ce serait de la preuve sociale fabriquée, et la
 * politique RLS rend l'agrégat illisible de toute façon (guide §5).
 *
 * ⚠️ **Le formulaire ne porte aucun état, et c'est la correction d'un défaut
 * réel.** La première version envoyait un champ caché `active` calculé au
 * rendu : le clic déclenchait un nouveau rendu **avant** que le navigateur ne
 * sérialise le formulaire, si bien que le serveur recevait l'inverse de
 * l'intention. Premier clic sans effet, second clic qui allumait le cœur sans
 * rien écrire. La bascule est désormais décidée en base, et le formulaire ne
 * transmet que l'identifiant de l'annonce — il n'y a plus d'état à
 * désynchroniser.
 *
 * **L'affichage anticipe sans jamais mentir.** Pendant l'envoi, on montre
 * l'inverse de la dernière vérité connue : c'est exactement ce que la bascule
 * va produire. Dès la réponse, on affiche ce que la base dit — y compris quand
 * l'écriture a échoué. Aucun état local, donc aucune dérive possible.
 */

interface Props {
  listingId: string;
  initial: boolean;
  /**
   * Faux pour un visiteur non connecté.
   *
   * ⚠️ Sans cette information, le bouton échouerait **en silence** : le geste
   * ne ferait rien et rien ne l'expliquerait. Le guide §5 range ce cas avec
   * les liens périmés — un retour muet est pire qu'un refus. On l'emmène donc
   * se connecter, en revenant ensuite sur ses favoris.
   */
  signedIn: boolean;
  /** Sur une carte, le bouton flotte sur la photo ; sur une fiche, il est en ligne. */
  variant?: "floating" | "inline";
  className?: string;
}

const STYLES = {
  floating: "absolute right-3 top-3 z-10",
  inline: "",
} as const;

function boutonClasses(variant: "floating" | "inline"): string {
  return cn(
    "flex items-center justify-center rounded-full transition-all duration-200 active:scale-[0.9]",
    variant === "floating"
      ? "h-9 w-9 bg-white/90 shadow-sm backdrop-blur hover:bg-white"
      : "h-10 w-10 border border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50",
  );
}

export function FavoriteButton({
  listingId,
  initial,
  signedIn,
  variant = "floating",
  className,
}: Props) {
  const [state, action, pending] = React.useActionState<FavoriteState, FormData>(
    toggleFavorite,
    {},
  );

  // Un visiteur non connecté n'a nulle part où ranger un favori. Plutôt qu'un
  // bouton qui ne fera rien, un lien qui l'emmène se connecter et le ramène.
  if (!signedIn) {
    return (
      <a
        href={`/connexion?suivant=${encodeURIComponent("/compte/favoris")}`}
        aria-label="Connectez-vous pour garder cette annonce de côté"
        title="Connectez-vous pour garder cette annonce de côté"
        onClick={(e) => e.stopPropagation()}
        className={cn(STYLES[variant], boutonClasses(variant), className)}
      >
        <Heart className="h-4 w-4 text-slate-500" aria-hidden />
      </a>
    );
  }

  // La dernière vérité connue : celle du serveur dès qu'elle est arrivée, sinon
  // celle du rendu initial.
  const connu = state.active ?? initial;

  // Pendant l'envoi, on montre le résultat que la bascule va produire. Aucune
  // variable d'état n'est nécessaire — et c'est ce qui rend la désynchronisation
  // impossible.
  const actif = pending ? !connu : connu;

  return (
    <form
      action={action}
      className={cn(STYLES[variant], className)}
      // Sur une carte, le bouton vit à l'intérieur d'un lien : sans cela, le
      // clic ouvrirait l'annonce au lieu de basculer le favori.
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="listingId" value={listingId} />

      <button
        type="submit"
        aria-pressed={actif}
        aria-label={actif ? "Retirer des favoris" : "Garder de côté"}
        title={actif ? "Retirer des favoris" : "Garder de côté"}
        disabled={pending}
        className={boutonClasses(variant)}
      >
        {/* ⚠️ Le cœur reste visible pendant l'envoi, dans sa couleur
            d'arrivée. Un spinner à sa place effacerait précisément le retour
            que la personne attend : elle a cliqué pour voir le cœur changer.
            L'opacité dit que ce n'est pas encore confirmé, sans rien cacher.
            Sur une connexion mobile béninoise, l'aller-retour se compte en
            centaines de millisecondes — c'est là que le retour immédiat
            compte le plus. */}
        <Heart
          className={cn(
            "h-4 w-4 transition-all duration-200",
            actif ? "fill-orange-500 text-orange-500" : "text-slate-500",
            pending && "opacity-60",
          )}
          aria-hidden
        />
      </button>

      {state.error ? (
        <p role="alert" className="sr-only">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
