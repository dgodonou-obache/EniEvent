"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Champ de mot de passe, avec bascule d'affichage.
 *
 * **Pourquoi cela compte plus qu'il n'y paraît.** Le public visé saisit le plus
 * souvent au pouce, sur un clavier mobile qui corrige et qui masque. Un mot de
 * passe de dix caractères tapé en aveugle se trompe une fois sur trois, et
 * l'utilisateur n'a aucun moyen de savoir laquelle — il conclut que le compte
 * ne marche pas. Voir ce qu'on tape supprime cette panne-là.
 *
 * Quatre précautions qui ne se voient pas :
 *
 * - `type="button"` — sans lui, le bouton **soumet le formulaire** : un clic
 *   pour regarder son mot de passe tenterait une connexion à moitié saisie ;
 * - l'`autoComplete` et le `name` sont transmis inchangés, pour que les
 *   gestionnaires de mots de passe continuent de reconnaître le champ ;
 * - le bouton reste hors du flux de tabulation (`tabIndex={-1}`) : au clavier,
 *   on passe du mot de passe au bouton d'envoi, pas à un œil ;
 * - le champ retrouve son masquage à chaque montage — on ne « retient » pas le
 *   choix d'afficher, qui laisserait un mot de passe en clair à l'écran suivant.
 */

export type PasswordInputProps = Omit<InputProps, "type">;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          // Place réservée au bouton : sans cette marge, un mot de passe long
          // passe dessous et devient illisible au moment précis où l'on
          // cherchait à le lire.
          className={cn("pr-11", className)}
          {...props}
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-xl text-slate-400 transition-all duration-200 hover:text-orange-600 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
