import { describe, expect, it, vi } from "vitest";

import { mailRecipient, sendEmail } from "@/lib/mail/resend";
import { renderEmail } from "@/lib/notify/emails";
import { KINDS } from "@/lib/notify/messages";

/**
 * Notifications par e-mail.
 *
 * Trois choses qu'aucun outil ne voit et qui coûtent cher en production :
 * l'**échappement** (un nom d'enseigne est une chaîne saisie par un partenaire),
 * la **variante texte** (sans elle, le message part en indésirable), et le nom
 * exact du champ de réponse chez Resend — `reply_to`, en serpent, ignoré sans
 * la moindre erreur s'il est écrit autrement.
 *
 * Aucun appel réseau : `fetch` est toujours injecté, et l'attente du
 * cadencement remplacée par une fonction vide.
 */

const CONFIG = {
  apiKey: "re_test",
  from: "ÉniEvent <bonjour@enievent.com>",
  replyTo: "contact@enievent.com",
};
const SITE = "https://enievent.com";
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Les tests n'attendent pas les 550 ms de cadencement. */
const NO_WAIT = async () => {};

describe("demande de devis reçue par un partenaire", () => {
  it("porte le détail qui évite de se connecter", () => {
    // C'est la seule raison de doubler le SMS : sans ces lignes, l'e-mail ne
    // serait qu'un SMS plus lent.
    const mail = renderEmail(
      "quote_request.new",
      {
        city: "Cotonou",
        eventDate: "2026-12-24",
        title: "Mariage à Fidjrossè",
        guests: 250,
        budgetMax: 3_500_000,
        currency: "XOF",
        reference: "DEM-2026-0042",
      },
      SITE,
    )!;

    expect(mail.subject).toBe("Vous avez une nouvelle demande de devis");
    expect(mail.html).toContain("Cotonou");
    expect(mail.html).toContain("24 décembre 2026");
    expect(mail.html).toContain("250");
    expect(mail.html).toContain("DEM-2026-0042");
    expect(mail.html).toContain("/pro/demandes");
  });

  it("formate le budget en francs, sans décimale", () => {
    // Règle impérative : tout montant passe par money.ts. Le XOF n'a pas de
    // décimale ; « 3 500 000,00 FCFA » trahirait un montant traité en flottant.
    const mail = renderEmail(
      "quote_request.new",
      { city: "Cotonou", budgetMax: 3_500_000, currency: "XOF" },
      SITE,
    )!;

    expect(mail.text).toMatch(/3\s500\s000 FCFA/);
    expect(mail.text).not.toContain(",00");
  });

  it("n'affiche pas les lignes absentes plutôt qu'un tiret", () => {
    // Une date souple est fréquente sur un mariage. « Date de l'événement : »
    // suivi de rien se lirait comme un bug.
    const mail = renderEmail("quote_request.new", { city: "Ouidah", eventDate: null }, SITE)!;

    expect(mail.html).not.toContain("Date de l'événement");
    expect(mail.html).not.toContain("Invités");
    expect(mail.html).toContain("Ouidah");
  });

  it("ignore un montant non entier plutôt que d'afficher un prix faux", () => {
    // Dans un e-mail, un mauvais montant vaut pire qu'un montant absent.
    const mail = renderEmail(
      "quote_request.new",
      { city: "Cotonou", budgetMax: 1500.5, currency: "XOF" },
      SITE,
    )!;

    expect(mail.html).not.toContain("Budget");
  });
});

describe("devis reçu par un client", () => {
  it("nomme le partenaire, donne le montant et mène au comparateur", () => {
    const mail = renderEmail(
      "quote.sent",
      { partner: "Saveurs du Bénin", amount: 1_250_000, currency: "XOF", requestId: UUID },
      SITE,
    )!;

    expect(mail.subject).toContain("Saveurs du Bénin");
    expect(mail.html).toContain(`/projets/${UUID}`);
    expect(mail.text).toMatch(/1\s250\s000 FCFA/);
  });

  it("reste compréhensible sans nom de partenaire", () => {
    const mail = renderEmail("quote.sent", { requestId: UUID }, SITE)!;

    expect(mail.subject).toBe("Un devis vous attend");
  });
});

describe("décision transmise au partenaire", () => {
  it("annonce un refus sans reproche, et rouvre la porte", () => {
    const mail = renderEmail("quote.declined", { city: "Porto-Novo" }, SITE)!;

    expect(mail.html).toContain("Porto-Novo");
    expect(mail.html).toContain("D&#39;autres demandes arrivent");
    expect(mail.html).toContain("/pro/demandes");
  });

  it("désigne dans l'objet la demande qui tombe, par sa référence", () => {
    // Un partenaire qui a répondu à trois appels d'offres cette semaine doit
    // savoir lequel tombe, sans ouvrir le message. La référence prime sur le
    // titre : c'est elle qu'il retrouve dans son espace et cite au téléphone.
    const mail = renderEmail(
      "quote.declined",
      { city: "Porto-Novo", title: "Mariage à Fidjrossè", reference: "DEM-2026-0039" },
      SITE,
    )!;

    expect(mail.subject).toBe("Oups ! La demande « DEM-2026-0039 » n'est plus disponible");
  });

  it("retombe sur le nom quand la référence manque", () => {
    // `reference` est `not null` en base, mais la charge utile vient d'un
    // déclencheur : rien ne garantit ses champs à l'exécution.
    const mail = renderEmail("quote.declined", { title: "Mariage à Fidjrossè" }, SITE)!;

    expect(mail.subject).toBe("Oups ! La demande « Mariage à Fidjrossè » n'est plus disponible");
  });

  it("reste lisible sans titre ni référence", () => {
    // La charge utile vient d'un déclencheur : rien ne garantit ses champs à
    // l'exécution. « La demande «  » n'est plus disponible » serait un bug visible.
    expect(renderEmail("quote.declined", {}, SITE)!.subject).toBe(
      "Oups ! Cette demande n'est plus disponible",
    );
  });

  it("tronque un titre à rallonge plutôt que de noyer l'objet", () => {
    // Rien ne borne le titre à la saisie ; sans troncature, la fin de la phrase
    // — donc l'information — sort de l'aperçu de la boîte de réception.
    const mail = renderEmail(
      "quote.declined",
      { title: "Mariage traditionnel et réception à la salle des fêtes de Fidjrossè" },
      SITE,
    )!;

    expect(mail.subject).toContain("…");
    expect(mail.subject.length).toBeLessThan(72);
    expect(mail.subject).toContain("n'est plus disponible");
  });

  it("mène un devis accepté vers l'espace partenaire", () => {
    const mail = renderEmail("quote.accepted", { city: "Cotonou", amount: 900_000 }, SITE)!;

    expect(mail.subject).toBe("Vous avez un devis accepté");
    expect(mail.html).toContain("/pro/devis");
  });
});

describe("échéance imminente", () => {
  it("accorde le pluriel au nombre d'offres", () => {
    const une = renderEmail("request.deadline", { offres: 1, requestId: UUID }, SITE)!;
    const plusieurs = renderEmail("request.deadline", { offres: 4, requestId: UUID }, SITE)!;

    expect(une.html).toContain("Un prestataire vous a répondu");
    expect(plusieurs.html).toContain("4 prestataires vous ont répondu");
  });

  it("désigne la demande concernée dans l'objet", () => {
    // Un client peut avoir plusieurs demandes ouvertes en même temps : sans la
    // référence, le rappel ne dit pas laquelle arrive à échéance.
    const mail = renderEmail(
      "request.deadline",
      { offres: 4, reference: "DEM-2026-0042", requestId: UUID },
      SITE,
    )!;

    expect(mail.subject).toBe("Rappel : Votre demande « DEM-2026-0042 » arrive bientôt à échéance !");
  });

  it("reste lisible sans référence", () => {
    const mail = renderEmail("request.deadline", { offres: 2, requestId: UUID }, SITE)!;

    expect(mail.subject).toBe("Rappel : Votre demande arrive bientôt à échéance !");
  });

  it("appelle à l'action dans le titre du corps", () => {
    // Le titre porte l'action attendue, là où l'objet porte l'alerte : répéter
    // « votre demande se termine » aux deux endroits ne disait rien de plus.
    const mail = renderEmail("request.deadline", { offres: 3, requestId: UUID }, SITE)!;

    expect(mail.html).toContain("Plus que quelques temps pour comparer et valider un devis");
    // Le corps texte reprend le titre : c'est sa première ligne.
    expect(mail.text.startsWith("Plus que quelques temps")).toBe(true);
  });

  it("affiche l'échéance à l'heure du Bénin", () => {
    // Le Bénin est à UTC+1 toute l'année. Annoncer 17 h pour une échéance de
    // 18 h ferait manquer la fenêtre au client.
    const mail = renderEmail(
      "request.deadline",
      { offres: 2, respondBy: "2026-12-20T17:00:00Z", requestId: UUID },
      SITE,
    )!;

    expect(mail.html).toContain("18:00");
  });
});

describe("garde-fous de rédaction", () => {
  it("rend tous les types déclarés", () => {
    // Un `kind` posé en base sans contenu associé resterait bloqué en file.
    for (const kind of KINDS) {
      expect(renderEmail(kind, { city: "Cotonou", requestId: UUID }, SITE), kind).not.toBeNull();
    }
  });

  it("refuse un type inconnu plutôt que d'envoyer un message vide", () => {
    expect(renderEmail("paiement.recu", {}, SITE)).toBeNull();
  });

  it("porte le logo dans le bon sens, sur tous les modèles", () => {
    // Dans l'application, `Éni` est orange et `Event` ardoise
    // (`PublicHeader.tsx`). L'e-mail avait l'inverse. Rien ne relie ces deux
    // endroits : seul ce test empêche la prochaine retouche de réinverser.
    for (const kind of KINDS) {
      const mail = renderEmail(kind, { city: "Cotonou", requestId: UUID }, SITE)!;

      expect(mail.html, kind).toContain('<span style="color:#f97316;">Éni</span>Event');
      expect(mail.html, kind).not.toContain('Éni<span style="color:#f97316;">Event</span>');
    }
  });

  it("centre le logo et le bouton", () => {
    const mail = renderEmail("quote.sent", { requestId: UUID }, SITE)!;

    // Le bouton est centré par `align="center"` sur une cellule : Outlook
    // ignore `margin:auto` sur un tableau, et le bouton y resterait à gauche.
    expect(mail.html).toContain('letter-spacing:-0.3px;text-align:center;');
    expect(mail.html).toContain('<td align="center">');
  });

  it("échappe ce qui vient de la base", () => {
    // Un nom d'enseigne est saisi par un partenaire. Concaténé tel quel dans du
    // HTML, c'est une injection — dans la boîte de réception d'un client.
    const mail = renderEmail(
      "quote.sent",
      { partner: '<script>alert("xss")</script>', requestId: UUID },
      SITE,
    )!;

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("donne toujours une variante texte non vide", () => {
    // Un message sans corps texte est noté comme indésirable par la plupart
    // des filtres — et illisible pour qui lit son courrier en texte brut.
    for (const kind of KINDS) {
      const mail = renderEmail(kind, { city: "Cotonou", requestId: UUID, offres: 2 }, SITE)!;

      expect(mail.text.length, kind).toBeGreaterThan(40);
      expect(mail.text, kind).not.toContain("<");
      expect(mail.subject.length, kind).toBeGreaterThan(0);
    }
  });

  it("tolère une URL de site terminée par une barre oblique", () => {
    // `NEXT_PUBLIC_SITE_URL` est saisie à la main sur Vercel.
    const mail = renderEmail("quote_request.new", { city: "Cotonou" }, "https://enievent.com/")!;

    expect(mail.html).not.toContain("com//pro");
  });
});

describe("destinataire", () => {
  it("normalise la casse", () => {
    expect(mailRecipient("  Contact@EniEvent.COM ")).toBe("contact@enievent.com");
  });

  it("refuse ce qui ne peut pas être une adresse", () => {
    expect(mailRecipient("contact")).toBeNull();
    expect(mailRecipient("contact@enievent")).toBeNull();
    expect(mailRecipient("deux adresses@enievent.com")).toBeNull();
    expect(mailRecipient("+2290197000001")).toBeNull();
  });
});

describe("envoi", () => {
  const content = { subject: "Objet", html: "<p>Bonjour</p>", text: "Bonjour" };

  it("appelle Resend avec l'expéditeur et l'adresse de réponse", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));

    const outcome = await sendEmail("Contact@Enievent.com", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(outcome.ok).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");

    const body = JSON.parse(init.body);
    expect(body.from).toBe("ÉniEvent <bonjour@enievent.com>");
    expect(body.to).toEqual(["contact@enievent.com"]);
    expect(body.text).toBe("Bonjour");
    // Serpent, et non chameau : `replyTo` serait ignoré sans erreur, et les
    // réponses des clients partiraient vers une boîte que personne ne relève.
    expect(body.reply_to).toBe("contact@enievent.com");
    expect(body).not.toHaveProperty("replyTo");
  });

  it("omet le champ de réponse quand il n'est pas configuré", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await sendEmail("contact@enievent.com", content, {
      config: { apiKey: "re_test", from: "ÉniEvent <bonjour@enievent.com>" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty("reply_to");
  });

  it("n'appelle pas la passerelle pour une adresse invalide", async () => {
    const fetchImpl = vi.fn();

    const outcome = await sendEmail("pas-une-adresse", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(outcome.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("journalise au lieu d'envoyer quand la clé est absente", async () => {
    const fetchImpl = vi.fn();

    const outcome = await sendEmail("contact@enievent.com", content, {
      config: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("non-configure");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ne lève pas quand la passerelle est hors d'atteinte", async () => {
    // Une coupure réseau ne doit jamais faire échouer l'action métier appelante.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const outcome = await sendEmail("contact@enievent.com", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("passerelle");
    expect(outcome.message).toContain("ECONNRESET");
  });

  it("rapporte un domaine non vérifié sans le confondre avec une clé invalide", async () => {
    // Le piège : Resend répond 403 pour un expéditeur dont le domaine n'est pas
    // vérifié. Sans le détail, on cherche du côté de la clé.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("The enievent.com domain is not verified", { status: 403 }));

    const outcome = await sendEmail("contact@enievent.com", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl: NO_WAIT,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("403");
    expect(outcome.message).toContain("not verified");
  });

  it("cadence les envois pour rester sous la limite de Resend", async () => {
    // Deux requêtes par seconde. Le drainage enchaîne jusqu'à 25 lignes : sans
    // cadencement, la moitié d'un lot reviendrait en 429.
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const attentes: number[] = [];
    const waitImpl = async (ms: number) => {
      attentes.push(ms);
    };

    await sendEmail("a@enievent.com", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl,
    });
    await sendEmail("b@enievent.com", content, {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      waitImpl,
    });

    // Le second envoi suit immédiatement le premier : il doit patienter.
    expect(attentes.at(-1)).toBeGreaterThan(0);
  });
});
