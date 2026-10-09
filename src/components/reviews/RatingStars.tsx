import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Une note, en étoiles.
 *
 * ⚠️ **« Pas encore de note » et « zéro » ne s'écrivent pas pareil** (§5 du
 * guide). Une note absente rend `null` ici : à l'appelant de dire « Pas encore
 * d'avis ». Cinq étoiles vides se liraient comme un jugement — « 0 sur 5 » —
 * alors que le vrai message est que personne ne s'est encore prononcé.
 *
 * Les demi-étoiles sont rendues par découpe (`overflow-hidden` + largeur en
 * pourcentage) plutôt que par un glyphe à moitié : une annonce notée 4,3 ne
 * doit pas s'arrondir à 4 à l'œil quand le chiffre dit 4,3.
 */
export function RatingStars({
  rating,
  size = "md",
  className,
}: {
  rating: number | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (rating == null) return null;

  const valeur = Math.max(0, Math.min(5, Number(rating)));
  const dimension = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${valeur.toFixed(1).replace(".", ",")} sur 5`}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        // Part de cette étoile à remplir : 1 pleine, 0 vide, 0,3 au tiers.
        const part = Math.max(0, Math.min(1, valeur - index));

        return (
          <span key={index} className="relative inline-block">
            <Star className={cn(dimension, "text-slate-200")} aria-hidden />
            {part > 0 ? (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${part * 100}%` }}
                aria-hidden
              >
                <Star className={cn(dimension, "fill-orange-400 text-orange-400")} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** La note en chiffres, telle qu'on la lit à côté des étoiles. */
export function formatRating(rating: number | null | undefined): string {
  if (rating == null) return "—";
  return Number(rating).toFixed(1).replace(".", ",");
}
