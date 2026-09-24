"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { KYC_BUCKET, SIGNED_URL_SECONDS, type KycDocumentType } from "@/lib/kyc";
import { createClient } from "@/utils/supabase/server";

/**
 * Pièces justificatives : le registre, et la lecture signée.
 *
 * Le fichier part **directement du navigateur vers le stockage**, comme pour
 * les photos : faire transiter 8 Mo par le serveur Next doublerait l'attente
 * sur une connexion mobile. Les politiques de stockage (migration 0041)
 * vérifient que le chemin commence par une organisation dont l'utilisateur est
 * `owner` ou `accountant` — le cloisonnement se joue là, pas ici.
 *
 * Ces actions ne font donc que tenir le registre `kyc_documents`, et émettre
 * les URL signées permettant de relire un document.
 */

export interface KycState {
  message?: string;
  error?: string;
  /** URL signée, courte durée, rendue par `signDocument`. */
  url?: string;
}

async function requireOrg(): Promise<{ orgId: string } | { error: string }> {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return { error: "Espace partenaire requis." };
  return { orgId: decision.org.orgId };
}

export async function registerDocument(
  _previous: KycState,
  formData: FormData,
): Promise<KycState> {
  const org = await requireOrg();
  if ("error" in org) return { error: org.error };

  const type = String(formData.get("type") ?? "") as KycDocumentType;
  const path = String(formData.get("path") ?? "");

  // ⚠️ Le chemin vient du navigateur : on refuse tout ce qui ne commence pas
  // par l'organisation. La politique de stockage l'a déjà imposé à l'écriture,
  // mais le registre, lui, est une table ordinaire — sans ce contrôle, on
  // pourrait y inscrire une ligne pointant le dossier d'un concurrent.
  if (!path.startsWith(`${org.orgId}/`)) {
    return { error: "Chemin de fichier invalide." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("kyc_documents")
    .insert({ org_id: org.orgId, type, file_path: path })
    .select("id");

  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  revalidatePath("/pro/documents");

  return { message: "Pièce déposée. Elle sera vérifiée sous quelques jours." };
}

export async function removeDocument(_previous: KycState, formData: FormData): Promise<KycState> {
  const org = await requireOrg();
  if ("error" in org) return { error: org.error };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("kyc_documents")
    .delete()
    .eq("id", id)
    .eq("org_id", org.orgId)
    .select("file_path");

  if (error) return { error: `Retrait impossible : ${error.message}` };

  // ⚠️ Un DELETE bloqué par une clause `USING` ne lève aucune erreur : la ligne
  // est invisible, la requête réussit en touchant zéro ligne. C'est exactement
  // le cas d'une pièce déjà validée, que la politique protège.
  if (!data || data.length === 0) {
    return { error: "Cette pièce a déjà été validée : elle ne peut plus être retirée." };
  }

  // Le fichier part aussi : le laisser encombrerait un seau privé sans que
  // rien ne le référence plus.
  await supabase.storage.from(KYC_BUCKET).remove([data[0].file_path]);

  revalidatePath("/pro/documents");

  return { message: "Pièce retirée." };
}

/**
 * Une URL signée pour relire un document.
 *
 * ⚠️ **Le seau est privé : il n'y a pas d'URL publique**, et il ne doit pas y
 * en avoir. Une URL signée expire en une minute — assez pour ouvrir la pièce,
 * pas pour la faire circuler.
 */
export async function signDocument(_previous: KycState, formData: FormData): Promise<KycState> {
  const org = await requireOrg();
  if ("error" in org) return { error: org.error };

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("kyc_documents")
    .select("file_path")
    .eq("id", id)
    .eq("org_id", org.orgId)
    .maybeSingle();

  if (!doc) return { error: "Pièce introuvable." };

  const { data, error } = await supabase.storage
    .from(KYC_BUCKET)
    .createSignedUrl(doc.file_path, SIGNED_URL_SECONDS);

  if (error || !data) return { error: `Lecture impossible : ${error?.message ?? "inconnue"}` };

  return { url: data.signedUrl };
}
