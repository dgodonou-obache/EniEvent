"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { KYC_BUCKET, SIGNED_URL_SECONDS } from "@/lib/kyc";
import { createClient } from "@/utils/supabase/server";

/**
 * Décisions sur les dossiers des partenaires.
 *
 * ⚠️ **La base refuse déjà qu'un partenaire se valide lui-même** :
 * `review_kyc_document` (migration 0055) exige `app.is_admin()`, et
 * `is_verified` n'est dans aucun `grant update` — un `update` direct, même
 * lancé par un administrateur, ne lèverait rien et toucherait zéro ligne. Ces
 * actions sont la porte d'entrée prévue, pas le rempart.
 */

export interface ReviewState {
  message?: string;
  error?: string;
  /** Adresse signée, à ouvrir côté client. Jamais rendue dans la page. */
  url?: string;
}

async function requireAdminUser() {
  const { decision } = await requireSpace("admin");
  if (!decision.granted) throw new Error("Accès réservé à l'équipe ÉniEvent.");
}

export async function reviewDocument(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  await requireAdminUser();

  const id = String(formData.get("documentId") ?? "");
  // ⚠️ La décision vient du **bouton de soumission**, qui porte son propre
  // `name`/`value`. Un champ caché mis à jour par le clic vaudrait l'inverse au
  // moment où le navigateur sérialise le formulaire (`CLAUDE.md` §6).
  const decision = String(formData.get("decision") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();

  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Décision inconnue." };
  }

  if (decision === "rejected" && motif.length === 0) {
    return { error: "Indiquez ce qui ne va pas : le partenaire doit savoir quoi redéposer." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("review_kyc_document", {
    piece: id,
    decision,
    motif: decision === "rejected" ? motif : undefined,
  });

  if (error) return { error: translate(error.message) };

  revalidatePath("/admin/documents");
  revalidatePath("/admin");
  // La validation du dernier document débloque la mise en ligne des annonces
  // de cette structure : la file de modération doit s'en apercevoir.
  revalidatePath("/admin/moderation");

  return {
    message:
      decision === "approved"
        ? "Pièce validée."
        : "Pièce refusée — le partenaire voit le motif sur son espace.",
  };
}

/**
 * Une URL signée pour ouvrir une pièce.
 *
 * ⚠️ **Le seau est privé, et il n'y a pas d'URL publique.** Une adresse signée
 * expire en une minute : assez pour ouvrir le document, pas pour le faire
 * circuler. Elle est demandée au clic et n'entre jamais dans le rendu de la
 * page — sans quoi elle voyagerait dans les journaux, les caches et la charge
 * RSC du document.
 */
export async function signKycDocument(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  await requireAdminUser();

  const id = String(formData.get("documentId") ?? "");
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("kyc_documents")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return { error: "Pièce introuvable." };

  const { data, error } = await supabase.storage
    .from(KYC_BUCKET)
    .createSignedUrl(doc.file_path, SIGNED_URL_SECONDS);

  if (error || !data) {
    // ⚠️ Le cas arrive vraiment : une ligne peut exister sans fichier derrière.
    // Le dire plutôt que de laisser un bouton qui ne fait rien.
    return {
      error: `Fichier introuvable dans le coffre (${doc.file_path}). Demandez au partenaire de le redéposer.`,
    };
  }

  return { url: data.signedUrl };
}

/** Les messages des fonctions Postgres sont déjà en français et destinés à être lus. */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Décision impossible.";
}
