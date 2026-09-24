import { Search, Users } from "lucide-react";

import { UserTable } from "@/components/admin/UserTable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { getAdminUsers } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";

/**
 * Les comptes.
 *
 * **L'écran existe d'abord pour répondre à une question de support** : qui est
 * cette personne qui écrit, et son compte est-il en état. D'où la recherche
 * par nom, adresse ou téléphone, et l'adresse non confirmée mise en évidence
 * plutôt que reléguée — c'est le premier symptôme d'un courriel qui n'arrive
 * pas, et cela s'est produit en production.
 *
 * Le seul geste offert est le changement de type de compte. Il passe par
 * `set_account_type` : un `update` direct sur `account_type` ne lèverait
 * aucune erreur et ne toucherait aucune ligne (migrations 0021 et 0040).
 */

export const metadata = { title: "Utilisateurs" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser("/admin/connexion");

  const { q } = await searchParams;
  const users = await getAdminUsers(q, 100);

  const sansConfirmation = users.filter((u) => !u.emailConfirmed).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Utilisateurs</h1>
        <p className="mt-1 text-sm text-slate-500">
          {users.length} compte{users.length > 1 ? "s" : ""}
          {q ? ` correspondant à « ${q} »` : ""}
          {sansConfirmation > 0
            ? ` · ${sansConfirmation} sans adresse confirmée`
            : " · toutes les adresses sont confirmées"}
        </p>
      </div>

      <form className="mb-6 flex gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nom, adresse e-mail ou téléphone"
          aria-label="Rechercher un compte"
          className="flex-1"
        />
        <Button type="submit" variant="outline">
          <Search className="mr-2 h-4 w-4" aria-hidden />
          Chercher
        </Button>
      </form>

      {sansConfirmation > 0 ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">
            {sansConfirmation} compte{sansConfirmation > 1 ? "s n'ont" : " n'a"} jamais confirmé son
            adresse.
          </span>{" "}
          Ces personnes se sont inscrites sans pouvoir se connecter. Avant de conclure à un abandon,
          vérifiez l&apos;acheminement du courrier : un lien qui n&apos;aboutit pas donne exactement
          la même trace.
        </p>
      ) : null}

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "Aucun compte ne correspond" : "Aucun compte"}
          description={
            q
              ? "Essayez une autre orthographe, ou une partie de l'adresse e-mail."
              : "Les inscriptions apparaîtront ici."
          }
        />
      ) : (
        <UserTable users={users} />
      )}
    </div>
  );
}
