import { describe, expect, it } from "vitest";

import { describeSignIn, describeSignUp } from "@/lib/auth/signup-outcome";

/**
 * Lecture du résultat d'une inscription et d'une connexion.
 *
 * **Ces tests existent à cause d'une panne réelle.** Un partenaire s'est
 * inscrit le 21 septembre 2026, n'a pas trouvé le courriel de confirmation, et
 * s'est heurté à trois impasses d'affilée :
 *
 * 1. il se réinscrit → « Vérifiez votre boîte mail », alors qu'aucun compte
 *    n'est créé et qu'aucun courriel ne part ;
 * 2. il se réinscrit encore → même écran, même silence ;
 * 3. il se connecte → « Adresse e-mail ou mot de passe incorrect », alors que
 *    son mot de passe est juste.
 *
 * La cause tient en une ligne : **Supabase ne rend aucune erreur quand
 * l'adresse est déjà prise.** Il rend un utilisateur d'apparence normale dont
 * `identities` est vide. Rien dans le typage ne le signale, rien ne lève, et
 * l'écran de succès s'affiche.
 */

const EMAIL = "fatoumbidieudonne4@gmail.com";

describe("inscription", () => {
  it("reconnaît l'adresse déjà prise à sa liste d'identités vide", () => {
    // Le cas qui a coûté un partenaire. Aucune erreur, un utilisateur rendu,
    // et pourtant rien n'a été créé.
    const issue = describeSignUp({ user: { identities: [] }, session: null }, EMAIL);

    expect(issue).toEqual({ kind: "deja-inscrit", email: EMAIL });
  });

  it("ne confond pas une vraie inscription en attente avec un doublon", () => {
    // Une inscription légitime rend une identité et pas de session : c'est le
    // chemin normal quand la confirmation d'e-mail est active.
    const issue = describeSignUp(
      { user: { identities: [{ id: "abc" }] }, session: null },
      EMAIL,
    );

    expect(issue).toEqual({ kind: "confirmation-attendue", email: EMAIL });
  });

  it("ouvre directement la session quand la confirmation n'est pas exigée", () => {
    const issue = describeSignUp(
      { user: { identities: [{ id: "abc" }] }, session: { access_token: "x" } },
      EMAIL,
    );

    expect(issue).toEqual({ kind: "connecte" });
  });

  it("reconnaît aussi le doublon annoncé en clair", () => {
    // Chemin emprunté quand la confirmation est désactivée : Supabase rend
    // alors une vraie erreur, et les deux formes doivent aboutir au même écran.
    for (const erreur of [
      { message: "User already registered" },
      { message: "quelque chose", code: "user_already_exists" },
    ]) {
      expect(describeSignUp({ error: erreur }, EMAIL).kind, JSON.stringify(erreur)).toBe(
        "deja-inscrit",
      );
    }
  });

  it("ne prend pas une panne pour un doublon", () => {
    const issue = describeSignUp({ error: { message: "network unreachable" } }, EMAIL);

    expect(issue.kind).toBe("echec");
    // Pas de jargon ni de message technique recopié tel quel.
    if (issue.kind === "echec") {
      expect(issue.message).not.toMatch(/network|unreachable|error/i);
    }
  });

  it("traite une réponse sans utilisateur comme une attente, pas un doublon", () => {
    // Accuser à tort quelqu'un d'avoir déjà un compte l'enverrait réinitialiser
    // un mot de passe qui n'existe pas.
    expect(describeSignUp({ session: null }, EMAIL).kind).toBe("confirmation-attendue");
  });
});

describe("connexion", () => {
  it("distingue une adresse non confirmée d'un refus", () => {
    for (const erreur of [
      { message: "Email not confirmed" },
      { message: "autre chose", code: "email_not_confirmed" },
    ]) {
      expect(describeSignIn({ error: erreur }).kind, JSON.stringify(erreur)).toBe(
        "adresse-non-confirmee",
      );
    }
  });

  it("garde un message unique pour tout le reste", () => {
    // ⚠️ La distinction précédente ne coûte rien : Supabase ne rend
    // `email_not_confirmed` que si le mot de passe est correct. Séparer
    // « adresse inconnue » de « mot de passe faux » dirait, lui, quels comptes
    // existent — on s'y refuse.
    for (const erreur of [
      { message: "Invalid login credentials" },
      { message: "quelque chose", code: "invalid_credentials" },
      { message: "" },
    ]) {
      expect(describeSignIn({ error: erreur }).kind, JSON.stringify(erreur)).toBe("refuse");
    }
  });

  it("laisse passer une connexion réussie", () => {
    expect(describeSignIn({}).kind).toBe("connecte");
    expect(describeSignIn({ error: null }).kind).toBe("connecte");
  });
});
