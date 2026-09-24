"use client";

import * as React from "react";
import { Heart, Loader2 } from "lucide-react";

import { toggleFavorite, type FavoriteState } from "@/app/(account)/compte/favoris/actions";
import { cn } from "@/lib/utils";

/**
 * Le cœur, sur une carte ou une fiche d'annonce.
 *
 * ⚠️ **Aucun compteur, jamais.** Ce bouton ne dit pas combien de personnes ont
 * mis l'annonce de côté : ce serait de la preuve sociale fabriquée, et la
 * politique RLS rend l'agrégat illisible de toute façon (guide §5).
 *
 * **L'état bascule à l'affichage, pas au retour du serveur.** Sur une
 * connexion mobile béninoise, attendre l'aller-retour ferait douter du clic et
 * en provoquerait un second. Le serveur a le dernier mot : `useActionState`
 * rend l'état réel, et le rendu s'y aligne — y compris pour annuler la
 * bascule si l'écriture a échoué.
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

  const [optimiste, setOptimiste] = React.useState(initial);

  // Le serveur tranche. Ajustement au rendu plutôt que dans un effet : c'est
  // un calcul, pas une conséquence — et `react-hooks/set-state-in-effect`
  // refuse la seconde forme.
  const [vuServeur, setVuServeur] = React.useState<boolean | undefined>(undefined);
  if (state.active !== undefined && state.active !== vuServeur) {
    setVuServeur(state.active);
    setOptimiste(state.active);
  }

  const actif = optimiste;

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

  return (
    <form
      action={action}
      className={cn(STYLES[variant], className)}
      // Sur une carte, le bouton vit à l'intérieur d'un lien : sans cela, le
      // clic ouvrirait l'annonce au lieu de basculer le favori.
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="active" value={String(!actif)} />

      <button
        type="submit"
        aria-pressed={actif}
        aria-label={actif ? "Retirer des favoris" : "Garder de côté"}
        title={actif ? "Retirer des favoris" : "Garder de côté"}
        disabled={pending}
        onClick={() => setOptimiste(!actif)}
        className={boutonClasses(variant)}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
        ) : (
          <Heart
            className={cn(
              "h-4 w-4 transition-all duration-200",
              actif ? "fill-orange-500 text-orange-500" : "text-slate-500",
            )}
            aria-hidden
          />
        )}
      </button>

      {state.error ? (
        <p role="alert" className="sr-only">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
