import { KeyRound } from "lucide-react";

import { PasswordForm } from "@/components/auth/PasswordForm";
import { getSessionContext } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/home";
import { safeInternalPath } from "@/lib/validation/redirect";

export const metadata = { title: "Nouveau mot de passe", robots: { index: false } };

/**
 * Arrivée du lien de réinitialisation.
 *
 * `/auth/callback` a déjà échangé le code contre une session : c'est elle qui
 * autorise le changement. Sans elle — lien expiré ou déjà utilisé — le
 * formulaire le dira au moment de l'envoi plutôt que d'afficher un écran vide.
 *
 * Page volontairement hors de tout espace : elle sert aussi bien un client
 * qu'un partenaire ou un administrateur, et le paramètre `retour` la ramène
 * chacun chez soi.
 */
export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string }>;
}) {
  const { retour } = await searchParams;

  // ⚠️ **Par défaut, chacun chez soi — d'après le profil, pas d'après le lien.**
  // Le courriel de réinitialisation est commun à tous les espaces et n'emporte
  // pas `retour` : le repli décidait donc seul, et il valait `/compte` pour
  // tout le monde. Un administrateur qui venait de changer son mot de passe
  // atterrissait dans l'espace client (25 novembre 2026). Le type de compte se
  // lit dans `profiles`, jamais dans `user_metadata`, que l'utilisateur écrit
  // lui-même.
  const context = await getSessionContext();
  const chezSoi = context ? homeFor(context.accountType) : "/connexion";

  // Une destination venue de l'URL ne doit jamais sortir du site.
  // ⚠️ Cinquième exemplaire du contrôle à la main, et le seul que l'audit du
  // 8 octobre 2026 avait d'abord manqué : il laissait passer `/\evil.com`.
  const apres = safeInternalPath(retour, chezSoi);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50">
          <KeyRound className="h-6 w-6 text-orange-500" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">
          Choisissez un nouveau mot de passe
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Il remplacera l&apos;ancien immédiatement.
        </p>

        <div className="mt-6">
          <PasswordForm apres={apres} libelle="Enregistrer" />
        </div>
      </div>
    </main>
  );
}
