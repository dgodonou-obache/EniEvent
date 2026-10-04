import { describe, expect, it } from "vitest";

import {
  ACTIVITY_COOKIE,
  COOKIE_MAX_AGE,
  INACTIVITY,
  REFRESH_AFTER_SECONDS,
  WARN_BEFORE_SECONDS,
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
  it("accorde un quart d'heure, back-office compris", () => {
    expect(INACTIVITY.default).toBe(15 * 60);
    expect(INACTIVITY.admin).toBe(15 * 60);

    for (const route of ["/compte", "/pro/dashboard", "/entreprise", "/recherche", "/", "/admin"]) {
      expect(timeoutFor(route), route).toBe(15 * 60);
    }
  });

  it("ne confond pas une route qui commence par les mêmes lettres", () => {
    // `/administration-des-lieux` n'est pas le back-office.
    expect(timeoutFor("/administration")).toBe(INACTIVITY.default);
  });

  it("ne laisse jamais le back-office plus permissif que le reste", () => {
    expect(INACTIVITY.admin).toBeLessThanOrEqual(INACTIVITY.default);
  });
});

/**
 * ⚠️ Le garde-fou qui manquait.
 *
 * Le cookie portait `maxAge = INACTIVITY.default` : le navigateur l'effaçait
 * à l'instant même où la session aurait dû expirer, et un horodatage absent
 * vaut « repose-le ». Le délai n'était donc **jamais** atteint — une session
 * de deux semaines passait, constaté en production. Rien ne le signalait :
 * les deux valeurs étaient justes séparément, c'est leur égalité qui tuait.
 */
describe("durée de vie du cookie", () => {
  it("survit largement au plus long des délais", () => {
    const plusLong = Math.max(...Object.values(INACTIVITY));

    expect(COOKIE_MAX_AGE).toBeGreaterThan(plusLong * 10);
  });

  it("n'est jamais égale à un délai d'inactivité", () => {
    // La forme exacte du défaut : une égalité, pas une valeur trop petite.
    for (const [espace, delai] of Object.entries(INACTIVITY)) {
      expect(COOKIE_MAX_AGE, espace).not.toBe(delai);
    }
  });
});

describe("avertissement avant coupure", () => {
  it("prévient avant la fin, et pas au dernier moment", () => {
    expect(WARN_BEFORE_SECONDS).toBeGreaterThanOrEqual(60);
    expect(WARN_BEFORE_SECONDS).toBeLessThan(Math.min(...Object.values(INACTIVITY)));
  });

  it("laisse la place à au moins un entretien d'horodatage avant d'avertir", () => {
    // Sinon la fenêtre s'ouvrirait avant que le premier geste n'ait pu
    // repousser l'échéance, et s'afficherait sur une session parfaitement vive.
    expect(Math.min(...Object.values(INACTIVITY)) - WARN_BEFORE_SECONDS).toBeGreaterThan(
      REFRESH_AFTER_SECONDS,
    );
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
  it("laisse passer une session utilisée il y a dix minutes", async () => {
    const valeur = await stamp(SECRET, Date.now() - 10 * MINUTE);
    expect(await check(SECRET, valeur, INACTIVITY.default)).toMatchObject({ state: "actif" });
  });

  it("expire une session laissée vingt minutes", async () => {
    const valeur = await stamp(SECRET, Date.now() - 20 * MINUTE);
    const r = await check(SECRET, valeur, INACTIVITY.default);

    expect(r.state).toBe("expiré");
    if (r.state !== "expiré") return;
    expect(r.idleSeconds).toBeGreaterThan(INACTIVITY.default);
  });

  it("expire une session oubliée depuis quinze jours", async () => {
    // Le cas rapporté : deux semaines d'absence, et l'accès passait encore.
    for (const delai of Object.values(INACTIVITY)) {
      const valeur = await stamp(SECRET, Date.now() - 15 * JOUR);
      expect(await check(SECRET, valeur, delai)).toMatchObject({ state: "expiré" });
    }
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
