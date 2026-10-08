import { describe, expect, it } from "vitest";

import { verdictWebhook } from "@/app/api/cron/paiements/route";

/**
 * Santé du webhook de paiement.
 *
 * ⚠️ **C'est l'alarme de la panne la plus coûteuse du tunnel.** FedaPay
 * désactive un point de terminaison qui échoue de façon répétée et n'en
 * informe que par courrier : plus rien n'arrive, aucun écran ne le montre, et
 * les clients paient pour des commandes qui restent marquées impayées.
 *
 * Elle a été refaite le 8 octobre 2026 parce qu'elle **comptait des absences**
 * — « zéro webhook désactivé » — ce qui faisait passer trois pannes distinctes
 * pour une bonne santé. Ces tests décrivent les trois.
 */

const NOTRE = "https://enievent.com/api/webhooks/fedapay";

describe("le webhook est en état", () => {
  it("reconnaît le nôtre parmi les actifs", () => {
    expect(verdictWebhook({ lisible: true, actifs: [NOTRE], desactives: [] })).toBe("actif");
  });

  it("l'accepte sur l'alias Vercel comme sur le domaine", () => {
    // Les tâches planifiées visent `*.vercel.app` pour ne dépendre d'aucun DNS.
    const alias = "https://eni-event.vercel.app/api/webhooks/fedapay";
    expect(verdictWebhook({ lisible: true, actifs: [alias], desactives: [] })).toBe("actif");
  });

  it("l'accepte au milieu d'autres webhooks", () => {
    const autres = ["https://ailleurs.example/hook", "https://autre.example/fedapay"];
    expect(verdictWebhook({ lisible: true, actifs: [...autres, NOTRE], desactives: [] })).toBe(
      "actif",
    );
  });

  it("tolère une barre finale", () => {
    expect(
      verdictWebhook({ lisible: true, actifs: [`${NOTRE}/`], desactives: [] }),
    ).toBe("actif");
  });
});

describe("les trois pannes qui passaient pour une bonne santé", () => {
  /** 1. Le nôtre a été éteint par FedaPay après des échecs répétés. */
  it("voit un webhook désactivé", () => {
    expect(verdictWebhook({ lisible: true, actifs: [], desactives: [NOTRE] })).toBe("désactivé");
  });

  /**
   * 2. Aucun webhook ne pointe chez nous. Le cas réel du passage en
   * production : le webhook du bac à sable existe, celui de la production non.
   */
  it("voit l'absence de webhook", () => {
    expect(verdictWebhook({ lisible: true, actifs: [], desactives: [] })).toBe("absent");
    expect(
      verdictWebhook({ lisible: true, actifs: ["https://ailleurs.example/hook"], desactives: [] }),
    ).toBe("absent");
  });

  /** 3. La liste n'a pas pu être lue — clé fausse, API injoignable. */
  it("voit une liste illisible, et ne la confond pas avec une liste saine", () => {
    expect(verdictWebhook({ lisible: false, motif: "HTTP 401" })).toBe("illisible");
  });

  it("ne confond aucune des quatre situations", () => {
    const verdicts = [
      verdictWebhook({ lisible: true, actifs: [NOTRE], desactives: [] }),
      verdictWebhook({ lisible: true, actifs: [], desactives: [NOTRE] }),
      verdictWebhook({ lisible: true, actifs: [], desactives: [] }),
      verdictWebhook({ lisible: false, motif: "peu importe" }),
    ];

    expect(new Set(verdicts).size).toBe(4);
  });
});

describe("robustesse", () => {
  it("ignore une adresse illisible sans tomber", () => {
    expect(() =>
      verdictWebhook({ lisible: true, actifs: ["(sans adresse)", "pas une url"], desactives: [] }),
    ).not.toThrow();

    expect(verdictWebhook({ lisible: true, actifs: ["pas une url"], desactives: [] })).toBe(
      "absent",
    );
  });

  it("ne se laisse pas tromper par un chemin voisin", () => {
    // Un chemin qui contient le nôtre sans être le nôtre.
    const voisin = "https://enievent.com/api/webhooks/fedapay/autre";
    expect(verdictWebhook({ lisible: true, actifs: [voisin], desactives: [] })).toBe("absent");
  });
});
