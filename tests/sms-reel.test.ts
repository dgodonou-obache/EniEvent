import { describe, expect, it } from "vitest";

import { premuxConfig, sendSms } from "@/lib/sms/premux";
import { measureSms, toGsmSafe } from "@/lib/sms/segments";

/**
 * Envoi réel vers la passerelle Premux.
 *
 * **Ce fichier envoie un vrai SMS et consomme un crédit.** Il ne s'exécute donc
 * que si `SMS_TEST_TO` est présent dans l'environnement — ce qui n'arrive pas
 * pendant `npm run verify`, Vitest ne lisant pas `.env.local` de lui-même.
 *
 *   npm run smoke:sms
 *
 * Le reste de la suite (`tests/sms.test.ts`) couvre la même chaîne sans réseau.
 * Celui-ci répond à la seule question qu'un test simulé ne peut pas trancher :
 * la passerelle accepte-t-elle réellement ce que nous lui envoyons.
 */

const NUMERO = process.env.SMS_TEST_TO;

// Texte volontairement typographié — apostrophe courbe, tiret cadratin — pour
// que l'envoi éprouve aussi la remise en alphabet GSM, pas seulement le réseau.
const MESSAGE =
  "ÉniEvent — une nouvelle demande de devis vous attend à Cotonou. " +
  "Répondez depuis l’espace pro : eni-event.vercel.app/pro/demandes";

describe.skipIf(!NUMERO)("envoi réel vers Premux", () => {
  it("lit la configuration depuis l'environnement", () => {
    const config = premuxConfig();

    expect(config, "PREMUX_API_KEY, PREMUX_DOMAIN ou PREMUX_SENDER_ID absente").not.toBeNull();
    console.log(`expéditeur : ${config?.senderId} | domaine déclaré : ${config?.domain}`);
  });

  it("tient en un seul segment après remise en alphabet GSM", () => {
    const brut = measureSms(MESSAGE);
    const propre = measureSms(toGsmSafe(MESSAGE));

    console.log(`avant : ${brut.encoding}, ${brut.segments} segment(s) — gênants : ${brut.offenders.join(" ")}`);
    console.log(`après : ${propre.encoding}, ${propre.segments} segment(s), ${propre.remaining} caractères restants`);

    expect(propre.encoding).toBe("gsm-7");
    expect(propre.segments).toBe(1);
  });

  it("est accepté par la passerelle", async () => {
    const outcome = await sendSms(NUMERO!, MESSAGE);
    console.log("résultat :", JSON.stringify(outcome));

    // Le message d'échec porte la réponse de Premux : c'est lui qui sert au
    // diagnostic (DOMAIN_NOT_ALLOWED, solde insuffisant, expéditeur refusé…).
    expect(outcome.ok, outcome.ok ? "" : outcome.message).toBe(true);
  });
});
