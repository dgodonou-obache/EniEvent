import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * « Mes réservations » veut dire **les miennes**, pas « celles que je peux lire ».
 *
 * Le 25 novembre 2026, un administrateur arrivé sur `/compte` au retour d'une
 * réinitialisation de mot de passe y a vu les commandes d'un client réel. Rien
 * n'avait fui hors de la plateforme : la RLS faisait exactement son travail, qui
 * est d'ouvrir ces lignes à l'administration — et au partenaire qui les reçoit.
 * C'est l'écran qui se reposait sur elle pour dire « les miennes », et elle ne
 * le dit pas.
 *
 * Ces garanties ne se voient qu'avec un compte qui a **plus** de droits qu'un
 * client : un test mené en particulier passe, quoi qu'il arrive. D'où une
 * lecture du code, doublée du §6 de `smoke:cloisonnement` contre la vraie base.
 */

const racine = join(__dirname, "..");
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");

/** Le corps d'une fonction exportée, jusqu'à la fonction suivante. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`export async function ${nom}(`);
  expect(debut, `${nom} introuvable`).toBeGreaterThanOrEqual(0);
  const suite = source.indexOf("\nexport ", debut + 1);
  return source.slice(debut, suite === -1 ? undefined : suite);
}

describe("l'espace client ne montre que ce qui appartient à l'utilisateur", () => {
  const orders = lire("src/lib/orders.ts");
  const receipts = lire("src/lib/receipts.ts");
  const quotes = lire("src/lib/quotes.ts");

  it("getMyOrders filtre sur le client", () => {
    expect(corps(orders, "getMyOrders")).toMatch(/\.eq\("client_id", user\.id\)/);
  });

  it("getMyPayments filtre sur le client de la commande, par une jointure stricte", () => {
    const f = corps(orders, "getMyPayments");
    expect(f).toMatch(/orders!inner\(/);
    expect(f).toMatch(/\.eq\("orders\.client_id", user\.id\)/);
  });

  it.each(["getMyReceipts", "getReceipt"])("%s filtre sur le client de la commande", (nom) => {
    expect(receipts).toMatch(/orders!inner\(/);
    expect(corps(receipts, nom)).toMatch(/\.eq\("orders\.client_id", user\.id\)/);
  });

  it.each(["getMyRequests", "getRequestDetail"])("%s se borne à l'auteur et à son entreprise", (nom) => {
    expect(corps(quotes, nom)).toMatch(/\.or\(perimetre\)/);
    expect(quotes).toMatch(/requester_id\.eq\.\$\{user\.id\}/);
  });

  it("/compte/paiements ne passe pas par la lecture réservée à l'administration", () => {
    const page = lire("src/app/(account)/compte/paiements/page.tsx");
    expect(page).toMatch(/getMyPayments\(/);
    expect(page).not.toMatch(/getPayments\(/);
  });

  it.each([
    ["src/app/(account)/compte/messages/page.tsx", "client"],
    ["src/app/(company)/entreprise/messages/page.tsx", "client"],
    ["src/app/(partner)/pro/(dashboard)/messages/page.tsx", "partner"],
  ])("%s dit de quel côté sont ses fils", (chemin, cote) => {
    expect(lire(chemin)).toContain(`getMyConversations("${cote}")`);
  });
});

describe("un compte d'administration n'a pas d'espace client", () => {
  it("le proxy le refuse sur /compte et /projets, avant que la page ne s'exécute", () => {
    const proxy = lire("src/utils/supabase/middleware.ts");
    expect(proxy).toMatch(/\["\/compte", "\/projets"\]/);
    expect(proxy).toContain('"admin-account"');
  });
});

describe("après une réinitialisation, chacun rentre chez soi", () => {
  it("le repli de /nouveau-mot-de-passe dépend du profil, pas d'une constante", () => {
    const page = lire("src/app/nouveau-mot-de-passe/page.tsx");
    expect(page).not.toMatch(/safeInternalPath\(retour, "\/compte"\)/);
    expect(page).toMatch(/homeFor\(context\.accountType\)/);
  });

  it("/auth/confirm lit le type de compte dans profiles, jamais dans user_metadata", () => {
    const route = lire("src/app/auth/confirm/route.ts");
    expect(route).not.toMatch(/user_metadata\?*\.account_type/);
    expect(route).toMatch(/from\("profiles"\)\.select\("account_type"\)/);
  });
});
