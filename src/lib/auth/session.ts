import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/server";

import {
  decideAccess,
  type AccessDecision,
  type AccountType,
  type Membership,
  type Space,
} from "./access";

/**
 * Résolution de session côté serveur.
 *
 * Le proxy garantit qu'un visiteur non authentifié n'atteint pas un espace
 * protégé ; ces fonctions sont la seconde barrière, celle qui compte : le proxy
 * peut être court-circuité par un appel direct à une Server Action, pas un
 * `requireSpace()` en tête de layout.
 *
 * La troisième et dernière barrière reste la RLS : même si cette couche se
 * trompait, la base ne renverrait rien qui ne soit permis.
 */

export interface SessionContext {
  user: User;
  accountType: AccountType;
  fullName: string | null;
  memberships: Membership[];
}

export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(signInPath = "/connexion"): Promise<User> {
  const user = await getUser();
  if (!user) redirect(signInPath);
  return user;
}

/**
 * Rassemble les faits dont dépend la décision d'accès : le type de compte et
 * les organisations dont l'utilisateur est membre.
 *
 * Deux requêtes plutôt qu'une jointure imbriquée : la clé étrangère vers
 * `organizations` est composite `(org_id, org_type)`, et l'imbrication PostgREST
 * sur une clé composite est fragile. Deux lectures indexées coûtent moins cher
 * qu'un embed qui casse à la première migration.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("full_name, account_type").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("org_id, org_type, role, status")
      .eq("user_id", user.id),
  ]);

  const orgIds = (members ?? []).map((m) => m.org_id);
  const { data: orgs } = orgIds.length
    ? await supabase
        .from("organizations")
        .select("id, legal_name, brand_name, status")
        .in("id", orgIds)
    : { data: [] };

  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  const memberships: Membership[] = (members ?? []).flatMap((member) => {
    const org = orgById.get(member.org_id);
    // Une organisation invisible (RLS, suppression concurrente) ne doit pas
    // faire planter le rendu : on ignore l'appartenance orpheline.
    if (!org) return [];

    return [
      {
        orgId: org.id,
        orgName: org.brand_name ?? org.legal_name,
        orgType: member.org_type,
        orgStatus: org.status,
        role: member.role,
        memberStatus: member.status,
      },
    ];
  });

  return {
    user,
    accountType: profile?.account_type ?? "particulier",
    fullName: profile?.full_name ?? null,
    memberships,
  };
}

export interface SpaceAccess {
  context: SessionContext;
  decision: AccessDecision;
}

/**
 * Redirige vers la connexion de l'espace demandé si la session manque, et
 * renvoie sinon la décision d'accès. Le layout choisit quoi afficher : la
 * coquille de l'espace, ou une page expliquant le refus.
 */
export async function requireSpace(space: Space, signInPath = "/connexion"): Promise<SpaceAccess> {
  const context = await getSessionContext();
  if (!context) redirect(signInPath);

  return {
    context,
    decision: decideAccess({
      space,
      accountType: context.accountType,
      memberships: context.memberships,
    }),
  };
}

/** Nom et adresse affichés dans la barre latérale ou l'en-tête de compte. */
export function identityOf(context: SessionContext, orgName?: string) {
  return {
    name: orgName ?? context.fullName ?? context.user.email?.split("@")[0] ?? "Mon compte",
    email: context.user.email ?? "",
  };
}
