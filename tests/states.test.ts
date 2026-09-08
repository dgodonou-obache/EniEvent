import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  QUOTE_STATUS_LABELS_CLIENT,
  QUOTE_STATUS_LABELS_PARTNER,
  QUOTE_TRANSITIONS,
  REQUEST_STATUS_LABELS,
  REQUEST_TRANSITIONS,
  acceptsNewQuotes,
  canTransitionQuote,
  canTransitionRequest,
  describeDeadline,
  quoteLabel,
} from "@/lib/states";

/**
 * Le risque de ce module n'est pas de se tromper de calcul, c'est de **diverger
 * de la base**. Un bouton proposé que le déclencheur refusera ensuite fait
 * passer le produit pour cassé. Ces tests lisent donc la migration et comparent.
 */

const migration = readFileSync(
  new URL("../supabase/migrations/0009_devis.sql", import.meta.url),
  "utf8",
);

/** Extrait les transitions écrites dans un garde SQL donné. */
function transitionsFromSql(functionName: string): Record<string, string[]> {
  const start = migration.indexOf(`function app.${functionName}()`);
  expect(start, `${functionName} introuvable dans la migration`).toBeGreaterThan(-1);

  const body = migration.slice(start, migration.indexOf("$$;", start));
  const pattern = /\(old\.status = '(\w+)'\s*and new\.status in \(([^)]*)\)\)/g;

  const found: Record<string, string[]> = {};
  for (const match of body.matchAll(pattern)) {
    found[match[1]] = match[2]
      .split(",")
      .map((value) => value.trim().replace(/'/g, ""))
      .sort();
  }

  expect(Object.keys(found).length, `aucune transition lue dans ${functionName}`).toBeGreaterThan(0);
  return found;
}

/** Les états sans issue ne figurent pas dans le SQL : on ne compare que le reste. */
function nonTerminal(table: Record<string, readonly string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(table)
      .filter(([, targets]) => targets.length > 0)
      .map(([from, targets]) => [from, [...targets].sort()]),
  );
}

describe("accord avec la base", () => {
  it("reprend exactement les transitions de demande écrites en SQL", () => {
    expect(nonTerminal(REQUEST_TRANSITIONS)).toEqual(
      transitionsFromSql("guard_request_transition"),
    );
  });

  it("reprend exactement les transitions de devis écrites en SQL", () => {
    expect(nonTerminal(QUOTE_TRANSITIONS)).toEqual(transitionsFromSql("guard_quote_transition"));
  });

  it("laisse la base seule maîtresse de l'acceptation", () => {
    // `accept_quote` refuse les offres rivales dans la même transaction : la
    // migration doit continuer d'interdire l'UPDATE direct.
    expect(migration).toContain("app.accepting_quote");
    expect(migration).toMatch(/ne s''accepte pas directement/);
  });
});

describe("transitions", () => {
  it("autorise la publication d'un brouillon", () => {
    expect(canTransitionRequest("draft", "open")).toBe(true);
  });

  it("refuse de dépublier une demande", () => {
    // Des partenaires ont déjà pu la lire : la remettre en brouillon
    // effacerait leur travail en cours.
    expect(canTransitionRequest("open", "draft")).toBe(false);
  });

  it("ferme toute évolution d'une demande attribuée", () => {
    expect(REQUEST_TRANSITIONS.awarded).toHaveLength(0);
  });

  it("autorise l'envoi puis le retrait d'un devis", () => {
    expect(canTransitionQuote("draft", "sent")).toBe(true);
    expect(canTransitionQuote("sent", "withdrawn")).toBe(true);
  });

  it("refuse de renvoyer un devis déjà refusé", () => {
    expect(canTransitionQuote("declined", "sent")).toBe(false);
  });
});

describe("formulation destinée aux utilisateurs", () => {
  it("ne laisse fuiter aucun terme technique", () => {
    const labels = [
      ...Object.values(REQUEST_STATUS_LABELS),
      ...Object.values(QUOTE_STATUS_LABELS_PARTNER),
      ...Object.values(QUOTE_STATUS_LABELS_CLIENT),
    ];

    for (const label of labels) {
      expect(label.length).toBeGreaterThan(2);
      expect(label).not.toMatch(/draft|sent|awarded|declined|pending|expired/i);
    }
  });

  it("dit la même chose différemment aux deux côtés du marché", () => {
    // « Accepté » côté partenaire, « Votre choix » côté client : c'est le même
    // état, mais pas la même nouvelle.
    expect(quoteLabel("accepted", "partner")).toBe("Accepté");
    expect(quoteLabel("accepted", "client")).toBe("Votre choix");
  });

  it("ménage le partenaire écarté", () => {
    expect(quoteLabel("declined", "partner")).toBe("Non retenu");
  });
});

describe("délai de réponse", () => {
  const now = new Date("2026-09-07T10:00:00Z");

  it("compte les heures restantes", () => {
    const deadline = describeDeadline("2026-09-07T18:00:00Z", now);
    expect(deadline.hoursLeft).toBe(8);
    expect(deadline.label).toBe("8 h pour répondre");
    expect(deadline.state).toBe("ouvert");
  });

  it("alerte à l'approche de l'échéance", () => {
    expect(describeDeadline("2026-09-07T14:00:00Z", now).state).toBe("urgent");
  });

  it("bascule en jours au-delà de 24 heures", () => {
    expect(describeDeadline("2026-09-09T10:00:00Z", now).label).toBe("2 jours pour répondre");
    expect(describeDeadline("2026-09-08T12:00:00Z", now).label).toBe("1 jour pour répondre");
  });

  it("reconnaît un délai dépassé", () => {
    const deadline = describeDeadline("2026-09-06T10:00:00Z", now);
    expect(deadline.state).toBe("depasse");
    expect(deadline.label).toBe("Délai de réponse dépassé");
  });

  it("tolère l'absence de date limite et une date illisible", () => {
    expect(describeDeadline(null, now).state).toBe("aucun");
    expect(describeDeadline("pas une date", now).state).toBe("aucun");
  });
});

describe("ouverture aux nouvelles offres", () => {
  const now = new Date("2026-09-07T10:00:00Z");

  it("accepte tant que la demande est ouverte et dans les délais", () => {
    expect(acceptsNewQuotes("open", "2026-09-08T10:00:00Z", now)).toBe(true);
  });

  it("refuse après le délai", () => {
    expect(acceptsNewQuotes("open", "2026-09-06T10:00:00Z", now)).toBe(false);
  });

  it("refuse sur une demande close ou attribuée", () => {
    expect(acceptsNewQuotes("closed", "2026-09-09T10:00:00Z", now)).toBe(false);
    expect(acceptsNewQuotes("awarded", null, now)).toBe(false);
  });
});
