import { createClient } from "@supabase/supabase-js";

/**
 * Comptes de démonstration.
 *
 *   node --env-file=.env.local scripts/seed-demo-users.mjs
 *
 * Créés par l'API d'administration avec `email_confirm: true` : aucun e-mail
 * n'est envoyé, ce qui contourne la limite de 2 messages par heure du service
 * intégré de Supabase et son cantonnement aux membres du projet.
 *
 * Idempotent : relancer met à jour les comptes existants au lieu d'échouer.
 * DÉVELOPPEMENT UNIQUEMENT — ces comptes ont un mot de passe public.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

export const DEMO_PASSWORD = "Demo!EniEvent2026";

/** L'organisation du seed à laquelle rattacher le partenaire de démonstration. */
const PARTNER_ORG_SLUG = "espaces-cotonou";

const ACCOUNTS = [
  {
    email: "demo-particulier@enievent.bj",
    metadata: {
      full_name: "Awa Hounkpatin",
      account_type: "particulier",
      phone: "+2290197000011",
      city: "Cotonou",
      country: "BJ",
    },
    role: "Particulier",
    lands: "/compte",
  },
  {
    email: "demo-entreprise@enievent.bj",
    metadata: {
      full_name: "Clarisse Adjovi",
      account_type: "entreprise",
      company_name: "ACME Bénin",
      phone: "+2290197000012",
      city: "Cotonou",
      country: "BJ",
    },
    role: "Entreprise (propriétaire)",
    lands: "/entreprise",
  },
  {
    email: "demo-partenaire@enievent.bj",
    // Pas de `company_name` : ce compte est rattaché à une organisation
    // existante du seed, pour que son back-office contienne de vraies annonces
    // plutôt qu'une coquille vide.
    metadata: {
      full_name: "Sylvain Dossou",
      account_type: "partenaire",
      phone: "+2290197000013",
      city: "Cotonou",
      country: "BJ",
    },
    role: "Partenaire (propriétaire d'Espaces Cotonou)",
    lands: "/pro/dashboard",
    attachToOrg: PARTNER_ORG_SLUG,
  },
  {
    email: "demo-admin@enievent.bj",
    metadata: { full_name: "Ops ÉniEvent", account_type: "particulier" },
    role: "Administrateur",
    lands: "/admin",
    promoteToAdmin: true,
  },
];

/** Crée le compte, ou met à jour celui qui existe déjà. */
async function upsertUser({ email, metadata }) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing?.users?.find((u) => u.email === email);

  if (found) {
    const { data, error } = await admin.auth.admin.updateUserById(found.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`mise à jour de ${email} : ${error.message}`);
    return { id: data.user.id, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`création de ${email} : ${error.message}`);
  return { id: data.user.id, created: true };
}

async function attachToOrganisation(userId, slug) {
  const { data: org, error } = await admin
    .from("organizations")
    .select("id, type, brand_name")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !org) {
    throw new Error(
      `organisation « ${slug} » introuvable — appliquez d'abord le seed (npm run db:seed)`,
    );
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .upsert(
      {
        org_id: org.id,
        org_type: org.type,
        user_id: userId,
        role: "owner",
        status: "active",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "org_id,user_id" },
    );

  if (memberError) throw new Error(`rattachement à ${slug} : ${memberError.message}`);
  return org.brand_name;
}

console.log("Comptes de démonstration\n");

let failed = 0;

for (const account of ACCOUNTS) {
  try {
    const { id, created } = await upsertUser(account);

    if (account.attachToOrg) {
      const orgName = await attachToOrganisation(id, account.attachToOrg);
      account.role = `Partenaire — ${orgName}`;
    }

    if (account.promoteToAdmin) {
      // La promotion se fait après coup : le déclencheur d'inscription ignore
      // délibérément un `account_type: "admin"` venu du client.
      const { error } = await admin
        .from("profiles")
        .update({ account_type: "admin" })
        .eq("id", id);
      if (error) throw new Error(`promotion administrateur : ${error.message}`);
    }

    console.log(`  ${created ? "créé  " : "à jour"}  ${account.email.padEnd(32)} ${account.role}`);
  } catch (error) {
    console.error(`  ÉCHEC   ${account.email.padEnd(32)} ${error.message}`);
    failed += 1;
  }
}

console.log(`\n  Mot de passe commun : ${DEMO_PASSWORD}`);
console.log("\n  Où atterrit chaque compte :");
for (const a of ACCOUNTS) console.log(`    ${a.email.padEnd(32)} → ${a.lands}`);

if (failed > 0) {
  console.error(`\n${failed} compte(s) en échec.`);
  process.exit(1);
}

console.log("\nPrêt. Connectez-vous sur /connexion (ou /pro/connexion pour le partenaire).");
