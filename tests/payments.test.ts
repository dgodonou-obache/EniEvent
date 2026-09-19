import { describe, expect, it, vi } from "vitest";

import { money } from "@/lib/money";
import { fedapayPhone, paymentProvider, toPaymentState } from "@/lib/payments/fedapay";

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
