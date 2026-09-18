import { describe, expect, it } from "vitest";

import { AUTH_TEMPLATES, LIEN_VALIDITE_SECONDES } from "@/lib/notify/auth-emails";

/**
 * Gabarits d'authentification.
 *
 * Ces messages ne passent pas par notre code : Supabase les expédie depuis une
 * copie qu'il garde de son côté. Personne ne les relit donc avant qu'un vrai
 * utilisateur ne les reçoive — et un marqueur mal orthographié ne se manifeste
 * pas par une erreur, mais par un **lien de confirmation absent** dans la boîte
 * d'un client qui ne peut plus activer son compte.
 *
 * D'où ces contrôles : le marqueur attendu est présent, le texte est français,
 * et l'identité visuelle est celle des notifications.
 */

const parCle = Object.fromEntries(AUTH_TEMPLATES.map((t) => [t.key, t]));

/** Les six modèles que Supabase connaît. Un de moins, et il sert son défaut anglais. */
const ATTENDUS = [
  "confirmation",
  "recovery",
  "magic_link",
  "email_change",
  "invite",
  "reauthentication",
];

describe("couverture", () => {
  it("couvre les six modèles de Supabase", () => {
    // Un modèle non publié reste au gabarit par défaut : anglais, sans logo.
    expect(AUTH_TEMPLATES.map((t) => t.key).sort()).toEqual([...ATTENDUS].sort());
  });

  it("n'a ni objet ni corps vide", () => {
    for (const t of AUTH_TEMPLATES) {
      expect(t.subject.trim().length, t.key).toBeGreaterThan(0);
      expect(t.html.length, t.key).toBeGreaterThan(400);
    }
  });
});

describe("marqueurs Supabase", () => {
  it("porte le lien d'action dans les cinq modèles qui en ont un", () => {
    // C'est le contrôle qui compte : sans ce marqueur, le message part avec un
    // bouton qui ne mène nulle part, et le compte ne peut pas être activé.
    for (const cle of ["confirmation", "recovery", "magic_link", "email_change", "invite"]) {
      expect(parCle[cle].html, cle).toContain("{{ .ConfirmationURL }}");
    }
  });

  it("emploie le code, et non un lien, pour la ré-authentification", () => {
    // Supabase n'envoie pas d'URL sur ce modèle : attendre un lien donnerait un
    // bouton vide.
    const t = parCle["reauthentication"];

    expect(t.html).toContain("{{ .Token }}");
    expect(t.html).not.toContain("{{ .ConfirmationURL }}");
    expect(t.subject).toContain("{{ .Token }}");
  });

  it("nomme les deux adresses lors d'un changement", () => {
    const t = parCle["email_change"];

    expect(t.html).toContain("{{ .Email }}");
    expect(t.html).toContain("{{ .NewEmail }}");
  });

  it("laisse les marqueurs intacts à travers l'échappement", () => {
    // `shell()` échappe tout ce qu'on lui passe. Les marqueurs ne contiennent
    // aucun caractère réservé, donc ils traversent — mais si l'un d'eux venait
    // à en contenir un, Supabase ne le reconnaîtrait plus et l'enverrait en
    // clair au destinataire.
    for (const t of AUTH_TEMPLATES) {
      expect(t.html, t.key).not.toContain("&lt;");
      expect(t.html, t.key).not.toMatch(/\{\{\s*&/);
    }
  });
});

describe("rédaction", () => {
  it("est en français, jamais au défaut anglais de Supabase", () => {
    const anglais = [
      "Confirm your email",
      "Reset your password",
      "Follow the link below",
      "You've been invited",
      "is your verification code",
    ];

    for (const t of AUTH_TEMPLATES) {
      for (const phrase of anglais) {
        expect(t.subject, t.key).not.toContain(phrase);
        expect(t.html, t.key).not.toContain(phrase);
      }
    }
  });

  it("rassure celui qui n'a rien demandé", () => {
    // Recevoir une réinitialisation sans l'avoir demandée fait craindre que le
    // compte soit déjà compromis. Le dire coûte une phrase.
    expect(parCle["recovery"].html).toContain("votre mot de passe");
    expect(parCle["recovery"].html).toMatch(/ignorez ce message/i);
    expect(parCle["confirmation"].html).toMatch(/ignorez ce message/i);
  });

  it("annonce une validité accordée à celle de Supabase", () => {
    // `mailer_otp_exp` vaut 3600 s côté Supabase ; le script le revérifie à
    // chaque publication. Ici on garde les deux constantes cohérentes.
    expect(LIEN_VALIDITE_SECONDES).toBe(3600);

    for (const cle of ["confirmation", "recovery", "magic_link"]) {
      expect(parCle[cle].html, cle).toMatch(/valable une heure/);
    }
  });

  it("ne réclame jamais le code par retour de message", () => {
    expect(parCle["reauthentication"].html).toMatch(/ne vous le demandera jamais/);
  });
});

describe("identité visuelle", () => {
  it("porte le logo dans le bon sens, comme les notifications", () => {
    // Même `shell()` que `./emails.ts` : c'est tout l'intérêt de l'avoir extrait.
    for (const t of AUTH_TEMPLATES) {
      expect(t.html, t.key).toContain('<span style="color:#f97316;">Éni</span>Event');
      expect(t.html, t.key).toContain("letter-spacing:-0.3px;text-align:center;");
    }
  });

  it("centre le bouton, là où il y en a un", () => {
    for (const cle of ["confirmation", "recovery", "magic_link", "email_change", "invite"]) {
      expect(parCle[cle].html, cle).toContain('<td align="center">');
      expect(parCle[cle].html, cle).toContain("background:#f97316;");
    }
  });
});
