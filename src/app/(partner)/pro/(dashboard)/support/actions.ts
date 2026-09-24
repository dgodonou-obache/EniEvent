"use server";

import { revalidatePath } from "next/cache";

import { requireSpace } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Écrire au support.
 *
 * ⚠️ **Rien n'est envoyé ici.** L'action écrit une ligne dans
 * `support_requests` ; un déclencheur met le courriel en file, et
 * `/api/cron/notifications` l'envoie. C'est la règle §8 du guide, et elle a
 * trois raisons : la cadence de Resend est de 2 requêtes par seconde, un envoi
 * raté depuis une Server Action serait perdu sans trace, et la demande reste
 * lisible dans le back-office même si le courriel n'arrive jamais.
 */

export interface SupportState {
  message?: string;
  error?: string;
  /**
   * Erreurs par nom de champ, dans la forme qu'attend `useFieldErrors` — ce
   * qui encadre le champ en rouge et y emmène l'utilisateur. L'ordre des clés
   * n'a aucune importance : le hook trie selon l'ordre du DOM.
   */
  fields?: Record<string, string>;
}

const MIN_BODY = 20;

export async function sendSupportRequest(
  _previous: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const { context, decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return { error: "Espace partenaire requis." };

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const replyTo = String(formData.get("replyTo") ?? "").trim();

  const fields: Record<string, string> = {};
  if (subject.length < 3) fields.subject = "Donnez un sujet d'au moins 3 caractères.";
  if (body.length < MIN_BODY) {
    // Le cas le plus fréquent, et le plus coûteux : « ça marche pas » n'est
    // pas exploitable, il faudra un aller-retour de plus.
    fields.body = `Décrivez ce que vous faisiez et ce qui s'est passé, en ${MIN_BODY} caractères au moins.`;
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(replyTo)) {
    fields.replyTo = "Cette adresse e-mail n'est pas valide.";
  }

  if (Object.keys(fields).length > 0) {
    return { error: "Vérifiez les champs en rouge.", fields };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("support_requests")
    .insert({
      user_id: context.user.id,
      org_id: decision.org.orgId,
      subject,
      body,
      reply_to: replyTo,
    })
    .select("id");

  if (error) return { error: `Envoi impossible : ${error.message}` };

  revalidatePath("/pro/support");

  return {
    message:
      "Message reçu. Nous répondons à l'adresse que vous avez indiquée, en général sous un jour ouvré.",
  };
}
