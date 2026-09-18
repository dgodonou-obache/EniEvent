import { describe, expect, it } from "vitest";

import { resendConfig, sendEmail } from "@/lib/mail/resend";
import { renderEmail } from "@/lib/notify/emails";

/**
 * Envoi réel vers la passerelle Resend.
 *
 * **Ce fichier envoie un vrai e-mail.** Il ne s'exécute donc que si
 * `EMAIL_TEST_TO` est présent dans l'environnement — ce qui n'arrive pas
 * pendant `npm run verify`, Vitest ne lisant pas `.env.local` de lui-même.
 *
 *   npm run smoke:email
 *
 * Le reste de la suite (`tests/email.test.ts`) couvre la même chaîne sans
 * réseau. Celui-ci répond à la seule question qu'un test simulé ne peut pas
 * trancher : **le domaine de l'expéditeur est-il réellement vérifié chez
 * Resend**. C'est le point de panne le plus fréquent, et son message d'erreur
 * parle de domaine là où on cherche une clé.
 */

const DESTINATAIRE = process.env.EMAIL_TEST_TO;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://enievent.com";

describe.skipIf(!DESTINATAIRE)("envoi réel vers Resend", () => {
  it("lit la configuration depuis l'environnement", () => {
    const config = resendConfig();

    expect(config, "RESEND_API_KEY ou EMAIL_FROM absente").not.toBeNull();
    console.log(`expéditeur : ${config?.from} | réponse vers : ${config?.replyTo ?? "(aucune)"}`);
  });

  it("est accepté par la passerelle", async () => {
    // Une vraie notification, pas un « test » : c'est la mise en page réelle
    // qu'il faut voir arriver dans une boîte, avec ses accents et son bouton.
    const content = renderEmail(
      "quote_request.new",
      {
        city: "Cotonou",
        title: "Mariage à Fidjrossè",
        eventDate: "2026-12-24",
        guests: 250,
        budgetMax: 3_500_000,
        currency: "XOF",
        reference: "DEM-2026-0042",
        respondBy: "2026-12-10T17:00:00Z",
      },
      SITE,
    )!;

    console.log(`objet : ${content.subject}`);

    const outcome = await sendEmail(DESTINATAIRE!, content);
    console.log("résultat :", JSON.stringify(outcome));

    // Le message d'échec porte la réponse de Resend : c'est lui qui sert au
    // diagnostic (domaine non vérifié, clé révoquée, quota dépassé…).
    expect(outcome.ok, outcome.ok ? "" : outcome.message).toBe(true);
  });
});
