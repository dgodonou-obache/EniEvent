import { describe, expect, it } from "vitest";

import { money } from "@/lib/money";
import { fedapayConfig, paymentProvider } from "@/lib/payments/fedapay";

/**
 * Ouverture réelle d'un paiement chez FedaPay.
 *
 * **Ce fichier appelle le vrai prestataire.** Il ne s'exécute que si
 * `FEDAPAY_SECRET_KEY` est présente — ce qui n'arrive pas pendant
 * `npm run verify`, Vitest ne lisant pas `.env.local` de lui-même.
 *
 *   npm run smoke:paiement
 *
 * `tests/payments.test.ts` couvre la même chaîne sans réseau. Celui-ci répond
 * aux questions qu'aucun test simulé ne tranche : l'API accepte-t-elle
 * réellement ce que nous lui envoyons, et la page de paiement s'ouvre-t-elle.
 *
 * ⚠️ Il refuse de s'exécuter contre une clé de production : un essai ne doit
 * jamais ouvrir un paiement réel.
 */

const CONFIGURE = Boolean(process.env.FEDAPAY_SECRET_KEY);

describe.skipIf(!CONFIGURE)("ouverture réelle chez FedaPay", () => {
  it("emploie bien une clé de bac à sable", () => {
    const config = fedapayConfig();

    expect(config, "FEDAPAY_SECRET_KEY absente").not.toBeNull();
    // Le garde-fou qui compte : sans lui, un essai pourrait débiter quelqu'un.
    expect(config?.sandbox, "clé de PRODUCTION — essai refusé").toBe(true);
  });

  it("ouvre une transaction et rend une page payable", async () => {
    const provider = paymentProvider();

    const out = await provider.checkout({
      reference: `PAY-ESSAI-${Date.now()}`,
      amount: money(450_000, "XOF"),
      description: "Acompte — essai ÉniEvent",
      customer: {
        firstName: "Essai",
        lastName: "ÉniEvent",
        email: "contact@enievent.com",
        phone: "+229 01 61 22 41 00",
      },
      callbackUrl: "https://enievent.com/paiement/retour",
      metadata: { essai: "smoke" },
    });

    console.log("résultat :", JSON.stringify(out));
    expect(out.ok, out.ok ? "" : out.message).toBe(true);
    if (!out.ok) return;

    expect(out.url).toContain("fedapay.com");
    console.log(`page de paiement : ${out.url}`);

    // Relecture : c'est elle qui fera foi au moment du webhook.
    const relu = await provider.readTransaction(out.providerRef);
    expect(relu.ok, relu.ok ? "" : relu.message).toBe(true);
    if (!relu.ok) return;

    console.log(
      `relecture : état ${relu.transaction.state} (${relu.transaction.rawStatus})`,
      `| montant ${relu.transaction.amount}`,
    );

    // Le montant constaté doit être exactement celui ouvert : c'est cette
    // comparaison que `settle_payment` refera avant d'encaisser.
    expect(relu.transaction.amount).toBe(450_000);
    expect(relu.transaction.state).toBe("pending");
    expect(relu.transaction.metadata.essai).toBe("smoke");
  });
});
