import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifySignature } from "@/app/api/webhooks/fedapay/route";

/**
 * Signature des webhooks FedaPay.
 *
 * ⚠️ **L'enjeu n'est pas seulement de refuser les faux : c'est d'accepter les
 * vrais.** FedaPay **éteint un point de terminaison qui échoue de façon
 * répétée**, et l'a déjà fait sur ce projet. Un algorithme faux d'un caractère
 * rejetterait tout, le webhook s'arrêterait, et plus aucun paiement ne se
 * dénouerait — sans erreur visible nulle part. C'est la panne la plus sournoise
 * du tunnel.
 *
 * La formule n'est **pas documentée** par FedaPay : elle a été relevée dans la
 * bibliothèque officielle `fedapay@1.2.5` (`src/Webhook.ts`,
 * `WebhookSignature.computeSignature`). Les signatures de ce fichier sont donc
 * fabriquées exactement comme la bibliothèque les fabrique — c'est la seule
 * manière d'éprouver notre lecture contre la leur sans appeler le réseau.
 */

const SECRET = "wh_un_secret_de_webhook_de_test";
const CORPS = JSON.stringify({ entity: { id: 4242, status: "approved" } });

/** Reproduction fidèle de `WebhookSignature.generateTestHeaderString`. */
function enTete(opts: { secret?: string; corps?: string; horodatage?: number; extra?: string[] } = {}) {
  const t = opts.horodatage ?? Math.floor(Date.now() / 1000);
  const corps = opts.corps ?? CORPS;
  const signature = createHmac("sha256", opts.secret ?? SECRET)
    .update(`${t}.${corps}`, "utf8")
    .digest("hex");

  return [`t=${t}`, ...(opts.extra ?? []), `s=${signature}`].join(",");
}

describe("une signature authentique est acceptée", () => {
  it("accepte l'en-tête tel que la bibliothèque officielle le produit", () => {
    expect(verifySignature(CORPS, enTete(), SECRET)).toBeNull();
  });

  /**
   * ⚠️ Le cas qui a motivé la correction du 8 octobre 2026.
   *
   * Pendant une **rotation de secret**, FedaPay signe avec l'ancien *et* le
   * nouveau pour qu'aucun destinataire ne décroche. Notre lecture n'en gardait
   * qu'une seule — la dernière — et aurait rejeté des envois valides au pire
   * moment : celui où l'on change une clé.
   */
  it("accepte quand l'en-tête porte plusieurs signatures, dont la nôtre", () => {
    const t = Math.floor(Date.now() / 1000);
    const ancienne = createHmac("sha256", "wh_ancien_secret").update(`${t}.${CORPS}`).digest("hex");
    const bonne = createHmac("sha256", SECRET).update(`${t}.${CORPS}`).digest("hex");

    // La nôtre en premier, puis en dernier : l'ordre ne doit rien changer.
    expect(verifySignature(CORPS, `t=${t},s=${bonne},s=${ancienne}`, SECRET)).toBeNull();
    expect(verifySignature(CORPS, `t=${t},s=${ancienne},s=${bonne}`, SECRET)).toBeNull();
  });

  it("ignore les champs inconnus d'un en-tête", () => {
    expect(verifySignature(CORPS, enTete({ extra: ["v1=quelque_chose"] }), SECRET)).toBeNull();
  });

  it("accepte un envoi vieux de quatre minutes", () => {
    const t = Math.floor(Date.now() / 1000) - 4 * 60;
    expect(verifySignature(CORPS, enTete({ horodatage: t }), SECRET)).toBeNull();
  });
});

describe("une signature douteuse est refusée", () => {
  it("refuse un autre secret", () => {
    expect(verifySignature(CORPS, enTete({ secret: "wh_mauvais" }), SECRET)).toBe("signature invalide");
  });

  /** Le corps est signé : le modifier d'un caractère doit tout invalider. */
  it("refuse un corps modifié après signature", () => {
    const entete = enTete();
    const falsifie = CORPS.replace('"approved"', '"declined"');

    expect(verifySignature(falsifie, entete, SECRET)).toBe("signature invalide");
  });

  it("refuse un envoi trop vieux — rejeu d'une capture", () => {
    const t = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(verifySignature(CORPS, enTete({ horodatage: t }), SECRET)).toBe("horodatage hors fenêtre");
  });

  /**
   * ⚠️ Plus strict que la bibliothèque officielle, qui ne regarde que l'âge :
   * un horodatage venu du futur trahit une horloge faussée ou un en-tête
   * forgé, et n'a aucune raison d'être toléré.
   */
  it("refuse un horodatage venu du futur", () => {
    const t = Math.floor(Date.now() / 1000) + 10 * 60;
    expect(verifySignature(CORPS, enTete({ horodatage: t }), SECRET)).toBe("horodatage hors fenêtre");
  });

  it("refuse un en-tête absent ou bricolé", () => {
    expect(verifySignature(CORPS, null, SECRET)).toBe("signature absente");

    for (const forge of ["", "n'importe quoi", "t=123", "s=abc", "t=,s=", "t=abc,s=def"]) {
      expect(verifySignature(CORPS, forge, SECRET), forge).not.toBeNull();
    }
  });

  it("refuse une signature de la bonne longueur mais fausse", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifySignature(CORPS, `t=${t},s=${"0".repeat(64)}`, SECRET)).toBe("signature invalide");
  });
});
