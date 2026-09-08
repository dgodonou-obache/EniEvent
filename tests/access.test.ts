import { describe, expect, it } from "vitest";

import {
  decideAccess,
  denialMessage,
  type DenialReason,
  type Membership,
  type Space,
} from "@/lib/auth/access";

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    orgId: "org-1",
    orgName: "Traiteur Delice",
    orgType: "partner",
    orgStatus: "active",
    role: "owner",
    memberStatus: "active",
    ...overrides,
  };
}

describe("espace personnel", () => {
  it("est ouvert à tout compte authentifié", () => {
    const decision = decideAccess({
      space: "account",
      accountType: "partenaire",
      memberships: [],
    });
    expect(decision.granted).toBe(true);
  });
});

describe("back-office ÉniEvent", () => {
  it("n'est ouvert qu'aux comptes administrateurs", () => {
    const decision = decideAccess({ space: "admin", accountType: "admin", memberships: [] });
    expect(decision.granted).toBe(true);
  });

  it.each(["particulier", "entreprise", "partenaire"] as const)(
    "refuse un compte %s",
    (accountType) => {
      const decision = decideAccess({ space: "admin", accountType, memberships: [] });
      expect(decision).toEqual({ granted: false, reason: "not-admin" });
    },
  );

  it("ne se laisse pas ouvrir par l'appartenance à une organisation", () => {
    // Le propriétaire d'une organisation n'est pas pour autant administrateur
    // de la plateforme : ce sont deux notions distinctes.
    const decision = decideAccess({
      space: "admin",
      accountType: "partenaire",
      memberships: [membership({ role: "owner" })],
    });
    expect(decision.granted).toBe(false);
  });
});

describe("espace partenaire", () => {
  it("s'ouvre à un membre actif d'une organisation active", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "partenaire",
      memberships: [membership()],
    });

    expect(decision.granted).toBe(true);
    if (decision.granted) expect(decision.org?.orgId).toBe("org-1");
  });

  it("s'ouvre aussi à un rôle non dirigeant", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "partenaire",
      memberships: [membership({ role: "staff" })],
    });
    expect(decision.granted).toBe(true);
  });

  it("refuse un compte sans organisation", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "particulier",
      memberships: [],
    });
    expect(decision).toEqual({ granted: false, reason: "no-organization" });
  });

  it("refuse une invitation jamais acceptée", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "partenaire",
      memberships: [membership({ memberStatus: "invited" })],
    });
    expect(decision).toEqual({ granted: false, reason: "membership-inactive" });
  });

  it("refuse un membre dont l'accès a été retiré", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "partenaire",
      memberships: [membership({ memberStatus: "revoked" })],
    });
    expect(decision).toEqual({ granted: false, reason: "membership-inactive" });
  });

  it("distingue une organisation en attente d'une organisation suspendue", () => {
    expect(
      decideAccess({
        space: "partner",
        accountType: "partenaire",
        memberships: [membership({ orgStatus: "pending" })],
      }),
    ).toEqual({ granted: false, reason: "org-pending" });

    expect(
      decideAccess({
        space: "partner",
        accountType: "partenaire",
        memberships: [membership({ orgStatus: "suspended" })],
      }),
    ).toEqual({ granted: false, reason: "org-suspended" });
  });

  it("ignore une organisation entreprise", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "entreprise",
      memberships: [membership({ orgType: "company" })],
    });
    expect(decision).toEqual({ granted: false, reason: "no-organization" });
  });

  it("retient l'organisation utilisable quand une autre est suspendue", () => {
    const decision = decideAccess({
      space: "partner",
      accountType: "partenaire",
      memberships: [
        membership({ orgId: "suspendue", orgStatus: "suspended" }),
        membership({ orgId: "saine" }),
      ],
    });

    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.org?.orgId).toBe("saine");
      expect(decision.available).toHaveLength(1);
    }
  });
});

describe("espace entreprise", () => {
  it("s'ouvre à un membre d'une organisation entreprise", () => {
    const decision = decideAccess({
      space: "company",
      accountType: "entreprise",
      memberships: [membership({ orgType: "company", role: "organizer" })],
    });
    expect(decision.granted).toBe(true);
  });

  it("n'est pas ouvert par une organisation partenaire", () => {
    const decision = decideAccess({
      space: "company",
      accountType: "partenaire",
      memberships: [membership({ orgType: "partner" })],
    });
    expect(decision).toEqual({ granted: false, reason: "no-organization" });
  });

  it("laisse entrer un compte appartenant aux deux mondes", () => {
    // Un traiteur qui est aussi cliente pour son propre séminaire.
    const memberships = [
      membership({ orgId: "traiteur", orgType: "partner" }),
      membership({ orgId: "acme", orgType: "company", orgName: "ACME CI" }),
    ];

    const asPartner = decideAccess({ space: "partner", accountType: "partenaire", memberships });
    const asCompany = decideAccess({ space: "company", accountType: "partenaire", memberships });

    expect(asPartner.granted && asPartner.org?.orgId).toBe("traiteur");
    expect(asCompany.granted && asCompany.org?.orgId).toBe("acme");
  });
});

describe("messages de refus", () => {
  const reasons: DenialReason[] = [
    "not-admin",
    "no-organization",
    "membership-inactive",
    "org-pending",
    "org-suspended",
  ];
  const spaces: Space[] = ["partner", "company"];

  it("existent pour chaque motif et restent compréhensibles", () => {
    for (const space of spaces) {
      for (const reason of reasons) {
        const { title, body } = denialMessage(reason, space);
        expect(title.length).toBeGreaterThan(10);
        expect(body.length).toBeGreaterThan(30);
        // Règle du projet : pas de jargon technique dans l'interface.
        expect(`${title} ${body}`.toLowerCase()).not.toMatch(/rls|policy|forbidden|403|null/);
      }
    }
  });

  it("adapte le message à l'espace refusé", () => {
    expect(denialMessage("no-organization", "partner").body).toMatch(/prestataire|partenaire/i);
    expect(denialMessage("no-organization", "company").body).toMatch(/entreprise|société/i);
  });
});
