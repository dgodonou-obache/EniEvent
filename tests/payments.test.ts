import { describe, expect, it, vi } from "vitest";

import { money } from "@/lib/money";
import {
  fedapayErrorCode,
  fedapayPhone,
  motifLisible,
  paymentProvider,
  toPaymentState,
} from "@/lib/payments/fedapay";

/**
 * Ouverture d'un paiement chez FedaPay.
 *
 * Trois choses qu'aucun outil ne voit, et qui coûtent de l'argent réel :
 * la **conversion des montants** (une erreur d'unité débite cent fois trop),
 * l'**enchaînement des deux appels** (s'arrêter au premier laisse une
 * transaction que personne ne peut payer), et la **traduction des états** (un
 * libellé inconnu pris pour « payé » livre une prestation jamais réglée).
 *
 * Aucun appel réseau : `fetch` est toujours injecté.
 */

const CONFIG = { secretKey: "sk_sandbox_test", sandbox: true };

const DEMANDE = {
  reference: "PAY-202609-000012",
  amount: money(450_000, "XOF"),
  description: "Acompte — Mariage à Fidjrossè",
  customer: {
    firstName: "Awa",
    lastName: "Hounkpatin",
    email: "awa@exemple.bj",
    phone: "+22901970000 01".replace(" ", ""),
  },
  callbackUrl: "https://enievent.com/paiement/retour",
  metadata: { paymentId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" },
};

/** Deux réponses enchaînées : création, puis jeton. */
function passerelle(creation: unknown, jeton: unknown) {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(creation), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(jeton), { status: 200 }));
}

const TX = { "v1/transaction": { id: 510016, status: "pending", amount: 450_000 } };
const JETON = { token: "jwt", url: "https://sandbox-process.fedapay.com/jwt" };

describe("ouverture d'un paiement", () => {
  it("envoie le montant en francs entiers, sans conversion", async () => {
    // Le XOF a une division de 1 chez FedaPay : l'unité mineure de money.ts
    // est déjà le franc. Multiplier par 100 débiterait cent fois trop.
    const fetchImpl = passerelle(TX, JETON);

    const out = await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(out.ok).toBe(true);

    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.amount).toBe(450_000);
    expect(corps.currency).toEqual({ iso: "XOF" });
  });

  it("vise le bac à sable tant que la clé n'est pas une clé de production", async () => {
    const fetchImpl = passerelle(TX, JETON);

    await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(fetchImpl.mock.calls[0][0]).toContain("sandbox-api.fedapay.com");
  });

  it("recopie notre référence et nos métadonnées chez le prestataire", async () => {
    // C'est ce qui permet de rattacher une transaction sans jamais croire ce
    // que le navigateur du client renvoie.
    const fetchImpl = passerelle(TX, JETON);

    await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.merchant_reference).toBe("PAY-202609-000012");
    expect(corps.custom_metadata.paymentId).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  });

  it("demande la page de paiement dans un second appel", async () => {
    // `POST /transactions` ne rend aucune adresse : s'arrêter là laisserait une
    // transaction orpheline que personne ne pourrait régler.
    const fetchImpl = passerelle(TX, JETON);

    const out = await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain("/transactions/510016/token");

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.providerRef).toBe("510016");
    expect(out.url).toBe(JETON.url);
  });

  it("signale l'échec quand la page ne peut pas être ouverte", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(TX), { status: 200 }))
      .mockResolvedValueOnce(new Response("indisponible", { status: 500 }));

    const out = await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    // Le message doit nommer la transaction restée ouverte, sinon elle est perdue.
    expect(out.message).toContain("510016");
  });

  it("distingue un refus du prestataire d'une panne de passerelle", async () => {
    const refus = vi.fn().mockResolvedValue(new Response('{"message":"Montant invalide"}', { status: 422 }));
    const panne = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const a = await paymentProvider({ config: CONFIG, fetchImpl: refus as unknown as typeof fetch })
      .checkout(DEMANDE);
    const b = await paymentProvider({ config: CONFIG, fetchImpl: panne as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("refus");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("passerelle");
  });

  it("n'appelle rien quand la clé est absente", async () => {
    const fetchImpl = vi.fn();

    const out = await paymentProvider({ config: null, fetchImpl: fetchImpl as unknown as typeof fetch })
      .checkout(DEMANDE);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("non-configure");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("relecture d'une transaction", () => {
  it("rend l'état et le montant constatés", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "v1/transaction": { id: 510016, status: "approved", amount: 450_000, custom_metadata: { paymentId: "abc" } },
        }),
        { status: 200 },
      ),
    );

    const out = await paymentProvider({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
      .readTransaction("510016");

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.transaction.state).toBe("paid");
    expect(out.transaction.rawStatus).toBe("approved");
    expect(out.transaction.amount).toBe(450_000);
    expect(out.transaction.metadata.paymentId).toBe("abc");
  });

  it("distingue une transaction inconnue d'une panne", async () => {
    const absente = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));

    const out = await paymentProvider({ config: CONFIG, fetchImpl: absente as unknown as typeof fetch })
      .readTransaction("999");

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("introuvable");
  });
});

/**
 * ⚠️ **Le motif d'un refus, et rien d'autre que le motif.**
 *
 * Mesuré le 21 octobre 2026 sur trois règlements refusés en production. Deux
 * défauts opposés s'y rencontraient :
 *
 * - `payments.last_error` portait « État canceled », exact et inutile : la vraie
 *   cause (`COULD_NOT_PERFORM_TRANSACTION`, refus de MTN) n'existait que dans le
 *   tableau de bord de FedaPay, alors qu'on relit la transaction et qu'on avait
 *   donc la réponse sous les yeux ;
 * - le champ qui la contient, `last_error_message`, transporte **la charge utile
 *   complète de l'opérateur, numéro du payeur compris**. Or `payments` est
 *   lisible par le partenaire autant que par le client (`payments_select`,
 *   migration 0026) : recopier ce message publierait le numéro d'un client à son
 *   prestataire, durablement, en contournant tout le masquage de la messagerie.
 *
 * D'où un filtre **positif** : ne sort que ce qui a la forme d'un code.
 */
describe("motif d'un refus", () => {
  // Capture réelle de la transaction 113799315, numéro remplacé.
  const MESSAGE_MTN = JSON.stringify({
    financialTransactionId: "13173414045",
    externalId: "pi_sPw_1792536831452",
    amount: "153",
    currency: "XOF",
    payer: { partyIdType: "MSISDN", partyId: "2290197873940" },
    payeeNote: "Payement sur FedaPay",
    status: "FAILED",
    reason: "COULD_NOT_PERFORM_TRANSACTION",
  });

  it("retient le motif que l'opérateur enfouit dans son corps d'erreur", () => {
    expect(fedapayErrorCode({ last_error_code: "API_ERROR", last_error_message: MESSAGE_MTN })).toBe(
      "COULD_NOT_PERFORM_TRANSACTION",
    );
  });

  it("ne laisse pas sortir le numéro du payeur", () => {
    // Le contrôle qui compte. Ce qui ressort finit dans une colonne que le
    // partenaire peut lire.
    const sorti = fedapayErrorCode({ last_error_code: "API_ERROR", last_error_message: MESSAGE_MTN });

    expect(sorti).not.toMatch(/\d{8}/);
    expect(sorti).not.toContain("2290197873940");
  });

  it("écarte un message libre en entier, même s'il explique mieux", () => {
    // Un texte libre peut contenir n'importe quoi — une adresse, un nom, un
    // numéro. On préfère ne rien dire à publier ce qu'on n'a pas relu.
    expect(
      fedapayErrorCode({
        last_error_code: null,
        last_error_message: "Le client 01 97 87 39 40 n'a pas validé à temps",
      }),
    ).toBeNull();
  });

  it("retombe sur le code générique quand le corps ne dit rien", () => {
    expect(fedapayErrorCode({ last_error_code: "NOT_ENOUGH_FUNDS" })).toBe("NOT_ENOUGH_FUNDS");
    expect(fedapayErrorCode({ last_error_code: "API_ERROR", last_error_message: "{}" })).toBe(
      "API_ERROR",
    );
  });

  it("ne dit rien plutôt que d'inventer sur une transaction saine", () => {
    expect(fedapayErrorCode({ last_error_code: null, last_error_message: null })).toBeNull();
    expect(fedapayErrorCode({})).toBeNull();
  });

  it("compose un motif qui se lit, et qui se cite au support", () => {
    expect(motifLisible("canceled", "COULD_NOT_PERFORM_TRANSACTION")).toBe(
      "État canceled — COULD_NOT_PERFORM_TRANSACTION",
    );
    // Sans motif, on n'ajoute pas un tiret vide.
    expect(motifLisible("canceled", null)).toBe("État canceled");
  });

  it("remonte le motif jusqu'à la relecture", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "v1/transaction": {
            id: 113799315,
            status: "canceled",
            amount: 150,
            last_error_code: "API_ERROR",
            last_error_message: MESSAGE_MTN,
          },
        }),
        { status: 200 },
      ),
    );

    const out = await paymentProvider({
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).readTransaction("113799315");

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.transaction.errorCode).toBe("COULD_NOT_PERFORM_TRANSACTION");
    // ⚠️ Le montant retenu reste **le nôtre**, jamais celui débité au client :
    // FedaPay a demandé 153 à MTN pour une transaction de 150, ses frais étant
    // à la charge du payeur. Comparer 153 à 150 ferait échouer en base un
    // paiement réellement encaissé.
    expect(out.transaction.amount).toBe(150);
  });
});

describe("traduction des états", () => {
  it("n'encaisse que sur un état réellement abouti", () => {
    expect(toPaymentState("approved")).toBe("paid");
    expect(toPaymentState("transferred")).toBe("paid");
  });

  it("ramène tout le reste à un état qui ne livre rien", () => {
    expect(toPaymentState("pending")).toBe("pending");
    expect(toPaymentState("declined")).toBe("failed");
    expect(toPaymentState("canceled")).toBe("cancelled");
    expect(toPaymentState("refunded")).toBe("refunded");
  });

  it("traite un libellé inconnu comme non abouti, jamais comme payé", () => {
    // Un état nouveau chez le prestataire ne doit pas valider un encaissement
    // par défaut : ce serait livrer une prestation jamais réglée.
    expect(toPaymentState("etat_invente_2027")).toBe("pending");
    expect(toPaymentState("")).toBe("pending");
  });
});

describe("numéro de téléphone", () => {
  it("sépare le numéro national du pays", () => {
    // FedaPay refuse la forme E.164 collée : « +22901... » n'est pas accepté.
    expect(fedapayPhone("+2290161224100")).toEqual({ number: "0161224100", country: "bj" });
  });

  it("accepte la forme espacée du jeu de démonstration", () => {
    expect(fedapayPhone("+229 01 97 00 00 01")).toEqual({ number: "0197000001", country: "bj" });
  });

  it("préfère aucun numéro à un mauvais numéro", () => {
    expect(fedapayPhone(null)).toBeNull();
    expect(fedapayPhone("+225 07 00 00 00 01")).toBeNull();
    expect(fedapayPhone("97000001")).toBeNull();
  });
});
