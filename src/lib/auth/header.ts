import { getSessionContext } from "@/lib/auth/session";
import { homeFor, type HeaderAccount } from "@/lib/auth/home";

/**
 * Ce que l'en-tête public doit savoir du visiteur.
 *
 * Renvoie `null` pour un visiteur anonyme — c'est le cas courant, et il ne
 * coûte qu'une lecture de cookie.
 *
 * Le nom est raccourci ici, côté serveur : un composant client ne doit recevoir
 * que des données prêtes à afficher, jamais la logique qui les met en forme.
 */
export async function headerAccount(): Promise<HeaderAccount | null> {
  const context = await getSessionContext();
  if (!context) return null;

  const complet = context.fullName?.trim() || context.user.email?.split("@")[0] || "Mon espace";

  // Le prénom suffit dans un bouton : « Awa » plutôt que « Awa Hounkpatin »,
  // qui pousserait l'en-tête à passer à la ligne sur un téléphone.
  const prenom = complet.split(/\s+/)[0];

  return {
    name: prenom.length > 14 ? `${prenom.slice(0, 13)}…` : prenom,
    href: homeFor(context.accountType),
  };
}
