import { describe, expect, it, vi } from "vitest";

import { measureSms, toGsmSafe } from "@/lib/sms/segments";
import { MAX_SEGMENTS, premuxRecipient, sendSms } from "@/lib/sms/premux";

/**
 * Un SMS est facturé au segment, pas au caractère. Ces tests protègent deux
 * choses qu'aucun outil ne voit : la **facture** (un caractère typographique
 * triple le coût d'un message) et la **forme du destinataire** attendue par
 * Premux, qui diffère de celle stockée en base.
 *
 * Aucun appel réseau : `fetch` est toujours injecté.
 */

const CONFIG = { apiKey: "pmx_test", domain: "premux.bj", senderId: "EniEvent" };

describe("longueur facturée", () => {
  it("compte 160 caractères pour un message purement GSM", () => {
    const measure = measureSms("A".repeat(160));

    expect(measure.encoding).toBe("gsm-7");
    expect(measure.segments).toBe(1);
    expect(measure.remaining).toBe(0);
  });

  it("bascule au second segment au 161e caractère", () => {
    // Et la capacité tombe à 153 : l'en-tête de raboutage mange 7 caractères.
    expect(measureSms("A".repeat(161)).segments).toBe(2);
    expect(measureSms("A".repeat(306)).segments).toBe(2);
    expect(measureSms("A".repeat(307)).segments).toBe(3);
  });

  it("garde l'alphabet GSM pour les accents français courants", () => {
    // é è à ù ç sont dans l'alphabet GSM : ils ne coûtent rien de plus.
    const measure = measureSms("Réservé à Cotonou, où l'on paie déjà");

    expect(measure.encoding).toBe("gsm-7");
    expect(measure.offenders).toEqual([]);
  });

  it("dénonce l'apostrophe typographique, qui triple la facture", () => {
    // C'est le piège central : ’ n'est pas dans l'alphabet GSM. Un seul
    // suffit à faire passer tout le message en UCS-2, donc à 70 caractères.
    const texte = "Vous avez reçu un devis pour l’événement".repeat(3);
    const measure = measureSms(texte);

    expect(measure.encoding).toBe("ucs-2");
    expect(measure.offenders).toContain("’");
    expect(measure.segments).toBeGreaterThan(1);
  });

  it("compte l'euro pour deux places", () => {
    // Le € vit dans la table d'échappement : deux septets, pas un.
    expect(measureSms("€").units).toBe(2);
    expect(measureSms("E").units).toBe(1);
  });

  it("ne facture rien pour un message vide", () => {
    expect(measureSms("").segments).toBe(0);
  });
});

describe("remise en alphabet GSM", () => {
  it("redresse apostrophes, guillemets et points de suspension", () => {
    const sortie = toGsmSafe("L’annonce « Salle Étoile »… confirmée");

    expect(sortie).toBe('L\'annonce "Salle Étoile"... confirmée');
    expect(measureSms(sortie).encoding).toBe("gsm-7");
  });

  it("remplace l'espace insécable par une espace ordinaire", () => {
    // `Intl` en produit dans les montants : « 25 000 XOF ».
    expect(measureSms(toGsmSafe("25 000 XOF")).encoding).toBe("gsm-7");
  });

  it("laisse intact ce qui appartient vraiment à l'alphabet GSM", () => {
    // é, è, à, ù en font partie : les dépouiller appauvrirait le français sans
    // rien économiser.
    const texte = "Réservé à Cotonou, où l'on paie déjà";
    expect(toGsmSafe(texte)).toBe(texte);
  });

  it("dépouille les accents absents de l'alphabet, eux", () => {
    // L'alphabet GSM contient « ò » mais pas « ô », « ö » mais pas « ê ». Aucune
    // règle ne permet de le deviner — d'où la normalisation systématique.
    expect(toGsmSafe("votre devis est prêt bientôt")).toBe("votre devis est pret bientot");
    expect(measureSms(toGsmSafe("prêt bientôt")).encoding).toBe("gsm-7");
    expect(measureSms("prêt bientôt").encoding).toBe("ucs-2");
  });
});

describe("destinataire Premux", () => {
  it("retire le + de la forme E.164", () => {
    // La base stocke +22901..., Premux attend 22901... — sans le +.
    expect(premuxRecipient("+2290197000001")).toBe("2290197000001");
  });

  it("accepte un numéro saisi avec des espaces", () => {
    // C'est la forme du jeu de démonstration : « +229 01 97 00 00 01 ».
    expect(premuxRecipient("+229 01 97 00 00 01")).toBe("2290197000001");
  });

  it("refuse un ancien numéro à 8 chiffres", () => {
    // Plus composable depuis le 30 novembre 2024 : l'envoyer serait payer pour rien.
    expect(premuxRecipient("97 00 00 01")).toBeNull();
  });

  it("refuse un numéro d'un autre pays", () => {
    expect(premuxRecipient("+225 07 00 00 00 01")).toBeNull();
  });
});

describe("envoi", () => {
  it("appelle Premux avec les deux en-têtes d'authentification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const outcome = await sendSms("+229 01 97 00 00 01", "Bonjour", {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://premux.bj/api/v1/messages/sms");
    expect(init.headers.Authorization).toBe("Bearer pmx_test");
    // Oublier cet en-tête donne une erreur qui ressemble à une clé invalide.
    expect(init.headers["X-Premux-Domain"]).toBe("premux.bj");
    expect(JSON.parse(init.body)).toEqual({
      to: "2290197000001",
      body: "Bonjour",
      senderId: "EniEvent",
    });
  });

  it("n'appelle pas la passerelle pour un numéro invalide", async () => {
    const fetchImpl = vi.fn();

    const outcome = await sendSms("97 00 00 01", "Bonjour", {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuse un message qui coûterait plus de deux segments", async () => {
    const fetchImpl = vi.fn();

    const outcome = await sendSms("+2290197000001", "A".repeat(400), {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("trop-long");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(MAX_SEGMENTS).toBe(2);
  });

  it("journalise au lieu d'envoyer quand la clé est absente", async () => {
    const fetchImpl = vi.fn();

    const outcome = await sendSms("+2290197000001", "Bonjour", {
      config: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("non-configure");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ne lève pas quand la passerelle est hors d'atteinte", async () => {
    // Une coupure réseau ne doit jamais faire échouer l'action métier appelante.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const outcome = await sendSms("+2290197000001", "Bonjour", {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("passerelle");
    expect(outcome.message).toContain("ECONNRESET");
  });

  it("rapporte une erreur HTTP de la passerelle", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("solde insuffisant", { status: 402 }));

    const outcome = await sendSms("+2290197000001", "Bonjour", {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("402");
    expect(outcome.message).toContain("solde insuffisant");
  });
});
