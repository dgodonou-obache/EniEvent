import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fedapayConfig, liveBlocker, paymentProvider } from "@/lib/payments/fedapay";

/**
 * Passage en argent réel — garde-fous.
 *
 * ⚠️ **Ce fichier ne touche pas au réseau.** Il éprouve la seule chose qui ne
 * se rattrape pas : la configuration avec laquelle on ouvre un paiement. Une
 * erreur ici ne se voit pas à l'écran, ne lève rien en test, et se découvre le
 * jour où un vrai client règle une vraie réservation.
 *
 * La règle qui structure tout : **fermé par défaut**. Une configuration
 * incomplète n'ouvre rien, et c'est l'ouverture qu'on bloque — en amont. Si le
 * refus portait sur l'encaissement, on aurait des transactions réelles en
 * suspens chez FedaPay, payées par des clients, que rien chez nous ne saurait
 * dénouer.
 */

const ORIGINE = { ...process.env };

beforeEach(() => {
  for (const cle of ["FEDAPAY_SECRET_KEY", "FEDAPAY_ENVIRONMENT", "FEDAPAY_WEBHOOK_SECRET"]) {
    delete process.env[cle];
  }
});

afterEach(() => {
  process.env = { ...ORIGINE };
});

describe("l'environnement se déduit de la clé", () => {
  it("reconnaît une clé de bac à sable", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_sandbox_abc123";
    expect(fedapayConfig()?.sandbox).toBe(true);
  });

  it("reconnaît une clé de production", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";
    expect(fedapayConfig()?.sandbox).toBe(false);
  });

  /**
   * ⚠️ Le sens du doute compte. Une clé au préfixe inattendu est traitée comme
   * une clé de **production** : partir vers l'API réelle avec une clé de bac à
   * sable échoue bruyamment en 401, alors que l'inverse — envoyer une clé de
   * production vers le bac à sable — ferait croire que tout va bien pendant
   * que plus aucun paiement n'est encaissé.
   */
  it("traite une clé méconnaissable comme une clé de production", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_abc123";
    expect(fedapayConfig()?.sandbox).toBe(false);
  });

  it("laisse FEDAPAY_ENVIRONMENT trancher quand elle est posée", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";
    process.env.FEDAPAY_ENVIRONMENT = "sandbox";
    expect(fedapayConfig()?.sandbox).toBe(true);
  });

  it("ne rend aucune configuration sans clé", () => {
    expect(fedapayConfig()).toBeNull();
  });
});

describe("refus d'ouvrir un paiement réel mal configuré", () => {
  it("exige le secret de webhook en production", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";
    expect(liveBlocker(fedapayConfig())).toMatch(/FEDAPAY_WEBHOOK_SECRET/);
  });

  it("laisse passer la production une fois le secret posé", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";
    process.env.FEDAPAY_WEBHOOK_SECRET = "wh_quelque_chose";
    expect(liveBlocker(fedapayConfig())).toBeNull();
  });

  it("n'exige rien en bac à sable", () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_sandbox_abc123";
    expect(liveBlocker(fedapayConfig())).toBeNull();
  });

  /**
   * Le test qui compte : le refus doit se produire **avant** le moindre appel
   * réseau. Un `fetchImpl` qui lève prouve qu'on n'y est jamais allé.
   */
  it("refuse sans appeler FedaPay", async () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";

    const jamais = (() => {
      throw new Error("FedaPay a été appelé alors que la configuration est incomplète");
    }) as unknown as typeof fetch;

    const resultat = await paymentProvider({ fetchImpl: jamais }).checkout({
      amount: { amount: 150_000, currency: "XOF" },
      description: "Essai",
      reference: "CMD-TEST",
      callbackUrl: "https://enievent.com/retour",
      metadata: {},
      customer: { firstName: "A", lastName: "B", email: "a@b.bj", phone: null },
    });

    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.reason).toBe("non-configure");
    expect(resultat.message).toMatch(/FEDAPAY_WEBHOOK_SECRET/);
  });
});

describe("le webhook refuse une production non authentifiée", () => {
  /**
   * ⚠️ Le refus doit être un **401 visible**, pas un 200 muet. FedaPay montre
   * les échecs dans son tableau de bord ; un accusé de réception poli sur une
   * configuration cassée ne se verrait nulle part, des deux côtés.
   *
   * Ce refus est sans conséquence : `liveBlocker` empêche déjà d'ouvrir le
   * moindre paiement réel dans cette configuration, il n'existe donc aucune
   * transaction à dénouer.
   */
  it("répond 401 en production sans secret de webhook", async () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_live_abc123";

    const { POST } = await import("@/app/api/webhooks/fedapay/route");
    const reponse = await POST(
      new Request("https://enievent.com/api/webhooks/fedapay", {
        method: "POST",
        body: JSON.stringify({ entity: { id: 42 } }),
      }),
    );

    expect(reponse.status).toBe(401);
  });

  /**
   * Le même envoi, en bac à sable, doit **passer la garde**.
   *
   * ⚠️ Le corps est volontairement sans identifiant de transaction : la route
   * rend alors 200 avant d'atteindre `after()`, que Vitest ne sait pas fournir
   * hors d'un contexte de requête Next. Ce qui est éprouvé reste exactement ce
   * qui compte — la garde de production ne se déclenche pas ici, puisqu'on va
   * plus loin qu'elle.
   */
  it("ne refuse pas en bac à sable, où la relecture suffit", async () => {
    process.env.FEDAPAY_SECRET_KEY = "sk_sandbox_abc123";

    const { POST } = await import("@/app/api/webhooks/fedapay/route");
    const reponse = await POST(
      new Request("https://enievent.com/api/webhooks/fedapay", {
        method: "POST",
        body: JSON.stringify({ sans: "transaction" }),
      }),
    );

    expect(reponse.status).toBe(200);
  });
});

describe("aucune clé de paiement ne part au navigateur", () => {
  /**
   * ⚠️ Tout ce qui porte `NEXT_PUBLIC_` est recopié dans le paquet servi à
   * chaque visiteur — donc public **pour toujours**, y compris après
   * correction : les paquets restent en cache et dans les historiques.
   *
   * Une case `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` a existé dans la documentation
   * sans qu'aucun code ne la lise. Une case vide à remplir, juste sous une
   * clé secrète, est une invitation à se tromper de ligne. Elle a été retirée ;
   * ce test interdit qu'elle revienne, et attrape au passage n'importe quelle
   * variable publique contenant un secret.
   */
  it("aucune variable NEXT_PUBLIC_ ne ressemble à un secret", () => {
    const suspectes = Object.entries(process.env)
      .filter(([cle]) => cle.startsWith("NEXT_PUBLIC_"))
      .filter(([, valeur]) => /\b(sk|sb_secret|re|wh|whsec)_/i.test(valeur ?? ""))
      .map(([cle]) => cle);

    expect(suspectes).toEqual([]);
  });

  it("aucune variable NEXT_PUBLIC_ ne concerne FedaPay", () => {
    const fedapay = Object.keys(process.env).filter((c) => /^NEXT_PUBLIC_.*FEDAPAY/i.test(c));

    expect(fedapay).toEqual([]);
  });
});
