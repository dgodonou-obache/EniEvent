import { redirect } from "next/navigation";

/**
 * `/pro`, l'adresse que tape un partenaire.
 *
 * ⚠️ **Elle rendait un 404 en production.** Signalé le 24 octobre 2026 depuis un
 * téléphone : un prestataire connecté qui tape `enievent.com/pro` — l'adresse
 * naturelle, celle qu'on retient et qu'on dicte — tombait sur l'écran intégré de
 * Next, en anglais, sans la moindre marque. Déconnecté, le proxy le renvoyait
 * vers `/pro/connexion` et masquait donc le trou : il ne s'ouvrait **qu'une fois
 * la session ouverte**, c'est-à-dire pour les seuls partenaires réels.
 *
 * Les trois autres espaces rendent leur tableau de bord à la racine
 * (`/compte`, `/entreprise`, `/admin`) ; le partenaire est le seul dont le sien
 * vit un cran plus bas, et personne n'avait posé l'adresse courte. On redirige
 * plutôt que de rendre le tableau de bord ici : une page a **une** adresse
 * canonique, et le menu latéral marque l'entrée active par la sienne.
 *
 * `tests/navigation.test.ts` exige désormais que chaque racine d'espace existe,
 * et `smoke:ecrans` rend `/pro` avec une vraie session.
 */
export default function PartnerRootPage() {
  redirect("/pro/dashboard");
}
