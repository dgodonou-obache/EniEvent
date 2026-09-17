import { describe, expect, it } from "vitest";

import {
  ACTIVITY_COOKIE,
  INACTIVITY,
  REFRESH_AFTER_SECONDS,
  check,
  stamp,
  timeoutFor,
} from "@/lib/auth/inactivity";

/**
 * Expiration par inactivité.
 *
 * Toute la protection tient dans la **signature** : sans elle, l'horodatage se
 * repousse depuis la console du navigateur et la session ne meurt jamais. Ces
 * tests éprouvent donc surtout ce qu'on essaie de faire passer.
 */

const SECRET = "secret-de-test-suffisamment-long-pour-un-hmac";
const AUTRE = "un-autre-secret-tout-aussi-long-mais-different";

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;

describe("délai selon l'espace", () => {
  it("accorde une heure au back-office", () => {
    // C'est là que se décident validations, remboursements et statuts.
    expect(timeoutFor("/admin")).toBe(INACTIVITY.admin);
    expect(timeoutFor("/admin/partenaires")).toBe(INACTIVITY.admin);
    expect(INACTIVITY.admin).toBe(3600);
  });

  it("accorde deux semaines partout ailleurs", () => {
    for (const route of ["/compte", "/pro/dashboard", "/entreprise", "/recherche", "/"]) {
      expect(timeoutFor(route), route).toBe(INACTIVITY.default);
    }
  });

  it("ne confond pas une route qui commence par les mêmes lettres", () => {
    // `/administration-des-lieux` n'est pas le back-office.
    expect(timeoutFor("/administration")).toBe(INACTIVITY.default);
  });
});

describe("horodatage signé", () => {
  it("reconnaît un horodatage qu'il vient d'émettre", async () => {
    const valeur = await stamp(SECRET);
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "actif" });
  });

  it("refuse un horodatage repoussé à la main", async () => {
    // L'attaque évidente : lire le cookie, remplacer le nombre, rester connecté
    // pour toujours.
    const valeur = await stamp(SECRET);
    const [, signature] = valeur.split(".");
    const triche = `${Math.floor(Date.now() / 1000)}.${signature}`.replace(/^\d+/, (n) =>
      String(Number(n) + 10_000),
    );

    expect(await check(SECRET, triche, INACTIVITY.default)).toMatchObject({ state: "invalide" });
  });

  it("refuse une signature d'un autre secret", async () => {
    const valeur = await stamp(AUTRE);
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "invalide" });
  });

  it("refuse un cookie bricolé de toutes pièces", async () => {
    for (const valeur of ["", "abc", "123", "123.", ".abc", "123.zz", "1.2.3"]) {
      const r = await check(SECRET, valeur, INACTIVITY.default);
      expect(["absent", "invalide"], valeur).toContain(r.state);
    }
  });

  it("refuse un horodatage venu du futur", async () => {
    // Horloge faussée ou cookie forgé : pas de sursis.
    const valeur = await stamp(SECRET, Date.now() + JOUR);
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "invalide" });
  });
});

describe("expiration", () => {
  it("laisse passer une session utilisée hier", async () => {
    const valeur = await stamp(SECRET, Date.now() - JOUR);
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "actif" });
  });

  it("expire une session oubliée depuis quinze jours", async () => {
    const valeur = await stamp(SECRET, Date.now() - 15 * JOUR);
    const r = await check(SECRET, valeur, INACTIVITY.default);

    expect(r.state).toBe("expiré");
    if (r.state !== "expiré") return;
    expect(r.idleSeconds).toBeGreaterThan(INACTIVITY.default);
  });

  it("expire une session d'administration après deux heures", async () => {
    // La même session reste valable ailleurs jusqu'à quinze jours : c'est le
    // passage sur /admin qui impose la règle stricte.
    const valeur = await stamp(SECRET, Date.now() - 120 * MINUTE);

    expect(await check(SECRET, valeur, INACTIVITY.admin)).toMatchObject({ state: "expiré" });
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "actif" });
  });

  it("ne déconnecte pas faute de cookie", async () => {
    // Session ouverte avant la mise en place, ou cookie effacé : on repose
    // l'horodatage, on ne punit pas.
    expect(await check(SECRET, undefined, INACTIVITY.default)).toEqual({ state: "absent" });
  });
});

describe("réécriture du cookie", () => {
  it("ne réécrit pas à chaque requête", () => {
    // Le proxy s'exécute aussi sur les images : un Set-Cookie par requête
    // serait du gaspillage pur.
    expect(REFRESH_AFTER_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it("porte un nom qui ne heurte pas ceux de Supabase", () => {
    expect(ACTIVITY_COOKIE.startsWith("sb-")).toBe(false);
  });
});
