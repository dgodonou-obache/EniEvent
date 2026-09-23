import { AlertCircle } from "lucide-react";

/**
 * Message d'erreur sous un champ.
 *
 * **Une seule implémentation.** Elle était recopiée à l'identique dans six
 * formulaires : six endroits où corriger une formulation, et six occasions
 * d'en oublier un.
 *
 * `role="alert"` pour que les lecteurs d'écran l'annoncent sans attendre que
 * l'utilisateur atteigne le champ, et une icône parce que la couleur seule ne
 * dit rien à qui ne distingue pas le rouge.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
