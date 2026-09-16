import { describe, expect, it } from "vitest";

import { KINDS, isKnownKind, renderSms, segmentsOf } from "@/lib/notify/messages";
import { measureSms, toGsmSafe } from "@/lib/sms/segments";

/**
 * Rédaction des notifications.
 *
 * Deux exigences, invisibles à la relecture : le message doit tenir en **un
 * segment** même dans le pire cas — nom d'enseigne à rallonge, ville longue,
 * identifiant de demande de 36 caractères — et rester dans l'alphabet GSM.
 * Une notification à deux segments double la facture de chaque envoi.
 */

const SITE = "https://eni-event.vercel.app";
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("demande de devis reçue par un partenaire", () => {
  it("tient en un segment avec une ville et une date", () => {
    const sms = renderSms("quote_request.new", { city: "Cotonou", eventDate: "2026-12-24" }, SITE);

    expect(sms).toContain("Cotonou");
    expect(sms).toContain("24/12");
    expect(sms).toContain("/pro/demandes");
    expect(segmentsOf(sms!)).toBe(1);
  });

  it("omet la date quand l'événement n'en a pas encore", () => {
    // Une date souple est fréquente sur un mariage : « pour le » suivi de rien
    // se lirait comme un bug.
    const sms = renderSms("quote_request.new", { city: "Ouidah", eventDate: null }, SITE);

    expect(sms).not.toContain("pour le");
    expect(segmentsOf(sms!)).toBe(1);
  });

  it("tient encore en un segment avec la ville la plus longue", () => {
    const sms = renderSms(
      "quote_request.new",
      { city: "Abomey-Calavi Godomey", eventDate: "2026-11-30" },
      SITE,
    );

    expect(segmentsOf(sms!)).toBe(1);
  });
});

describe("devis reçu par un client", () => {
  it("nomme le partenaire et mène droit au comparateur", () => {
    const sms = renderSms("quote.sent", { partner: "Saveurs du Bénin", requestId: UUID }, SITE);

    expect(sms).toContain("Saveurs du Bénin");
    expect(sms).toContain(`/projets/${UUID}`);
    expect(segmentsOf(sms!)).toBe(1);
  });

  it("tient en un segment malgré un nom d'enseigne à rallonge", () => {
    // Le nom vient de la base : rien n'en borne la longueur à la saisie.
    const sms = renderSms(
      "quote.sent",
      { partner: "Société Béninoise de Restauration et Réceptions du Littoral", requestId: UUID },
      SITE,
    );

    expect(segmentsOf(sms!)).toBe(1);
    // Tronqué à 24 caractères, point final compris.
    expect(sms).toContain("Société Béninoise de Re.");
  });

  it("reste compréhensible sans nom de partenaire", () => {
    const sms = renderSms("quote.sent", { requestId: UUID }, SITE);

    expect(sms).toContain("Un devis vous attend");
    expect(segmentsOf(sms!)).toBe(1);
  });
});

describe("garde-fous", () => {
  it("rend tous les types déclarés", () => {
    // Un `kind` posé en base sans texte associé resterait bloqué en file.
    for (const kind of KINDS) {
      expect(renderSms(kind, { city: "Cotonou", requestId: UUID }, SITE), kind).not.toBeNull();
    }
  });

  it("refuse un type inconnu plutôt que d'envoyer un message vide", () => {
    expect(renderSms("paiement.recu", {}, SITE)).toBeNull();
    expect(isKnownKind("paiement.recu")).toBe(false);
  });

  it("tolère une URL de site terminée par une barre oblique", () => {
    // `NEXT_PUBLIC_SITE_URL` est saisie à la main sur Vercel.
    const sms = renderSms("quote_request.new", { city: "Cotonou" }, "https://eni-event.vercel.app/");

    expect(sms).not.toContain("app//pro");
  });

  it("ne laisse aucun message sortir de l'alphabet GSM", () => {
    // C'est la garde qui compte : un « ç », une apostrophe courbe ou un tiret
    // cadratin glissé dans un libellé ferait tomber la capacité à 70.
    for (const kind of KINDS) {
      const sms = renderSms(kind, { city: "Sèmè-Podji", partner: "Reçu & Co", requestId: UUID }, SITE);
      const measure = measureSms(sms!);

      expect(measure.encoding, `${kind} → ${measure.offenders.join(" ")}`).toBe("gsm-7");
    }
  });

  it("redresse bien le ç minuscule, absent de l'alphabet GSM", () => {
    // « Ç » majuscule existe en GSM, « ç » non : le piège est asymétrique.
    expect(measureSms("reçu").encoding).toBe("ucs-2");
    expect(measureSms(toGsmSafe("reçu")).encoding).toBe("gsm-7");
    expect(toGsmSafe("reçu")).toBe("recu");
  });
});
