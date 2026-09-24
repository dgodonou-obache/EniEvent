"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/home";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database";

/**
 * Inviter un collègue, et accepter une invitation.
 *
 * ⚠️ **Le jeton ne transite jamais par l'écran de celui qui invite.** Il est
 * écrit par la base, part par courriel, et n'est lisible par personne — pas
 * même par le propriétaire de la structure, à qui `revoke select (token)`
 * l'interdit. Le lui montrer permettrait de le transmettre par un autre canal,
 * et l'invitation cesserait d'être une preuve que l'adresse est bien relevée.
 *
 * ⚠️ **L'envoi ne se fait pas ici** : un déclencheur met le courriel en file,
 * et `/api/cron/notifications` l'envoie (§8 du guide).
 */

type OrgRole = Database["public"]["Enums"]["org_role"];

export interface InviteState {
  message?: string;
  error?: string;
  fields?: Record<string, string>;
}

export async function inviteMember(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const space = String(formData.get("space") ?? "");
  const isPartner = space === "partner";

  const { decision } = await requireSpace(
    isPartner ? "partner" : "company",
    isPartner ? "/pro/connexion" : "/connexion",
  );

  if (!decision.granted || !decision.org) return { error: "Structure introuvable." };

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "") as OrgRole;

  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return { error: "Vérifiez le champ en rouge.", fields: { email: "Adresse e-mail invalide." } };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("invite_member", {
    org: decision.org.orgId,
    adresse: email,
    role_demande: role,
  });

  // La base refuse en clair — déjà membre, rôle impossible, adresse invalide.
  // Ces messages sont écrits pour être lus par un humain : on les relaie.
  if (error) return { error: error.message };

  revalidatePath(isPartner ? "/pro/equipe" : "/entreprise/equipe");

  return {
    message: `Invitation envoyée à ${email}. Elle est valable quinze jours, et ne fonctionnera qu'avec cette adresse.`,
  };
}

export async function cancelInvitation(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const space = String(formData.get("space") ?? "");
  const isPartner = space === "partner";

  const { decision } = await requireSpace(
    isPartner ? "partner" : "company",
    isPartner ? "/pro/connexion" : "/connexion",
  );

  if (!decision.granted || !decision.org) return { error: "Structure introuvable." };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("id", id)
    .eq("org_id", decision.org.orgId)
    .select("email");

  if (error) return { error: `Retrait impossible : ${error.message}` };

  // ⚠️ Un DELETE bloqué par une clause `USING` ne lève rien : il touche zéro
  // ligne. Sans ce contrôle, l'écran annoncerait un retrait qui n'a pas eu lieu.
  if (!data || data.length === 0) return { error: "Invitation introuvable." };

  revalidatePath(isPartner ? "/pro/equipe" : "/entreprise/equipe");

  return { message: `Invitation de ${data[0].email} retirée. Le lien ne fonctionne plus.` };
}

export interface AcceptState {
  error?: string;
  /** Où aller une fois entré dans l'équipe. */
  destination?: string;
}

export async function acceptInvitation(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Connectez-vous avec l'adresse qui a reçu l'invitation, puis réessayez." };
  }

  const { data, error } = await supabase.rpc("accept_invitation", { jeton: token });

  // Les refus de la base sont écrits pour être lus : invitation expirée, déjà
  // utilisée, ou adresse qui ne correspond pas. Les reformuler ferait perdre
  // la précision qui permet de se corriger.
  if (error) return { error: error.message };

  // ⚠️ La destination suit le **type d'organisation rejointe**, pas le
  // `account_type` du compte. Un particulier invité chez un partenaire garde
  // son type de compte — l'appartenance vient de `organization_members`, pas
  // du profil (guide §3) — mais il doit atterrir dans l'espace où il vient
  // d'entrer, sans quoi il ne verrait rien de ce qu'on lui a ouvert.
  revalidatePath("/pro/equipe");
  revalidatePath("/entreprise/equipe");

  return {
    destination: homeFor(data?.org_type === "partner" ? "partenaire" : "entreprise"),
  };
}
