import { createClient } from "@supabase/supabase-js";

/**
 * Vérification de bout en bout contre le projet Supabase réel.
 *
 *   node --env-file=.env.local scripts/smoke-remote.mjs
 *
 * Les tests locaux (PGlite) valident le schéma et la RLS ; celui-ci valide la
 * même chose à travers la vraie pile — PostgREST, GoTrue, Postgres 17 — avec
 * les clés du projet. Tous les comptes créés sont supprimés à la fin.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const anon = createClient(url, publishable, { auth: { persistSession: false } });

const createdUsers = [];
// Les organisations ne référencent pas leur créateur : supprimer le compte auth
// ne les emporte pas. Sans ce suivi, chaque passage laisserait un partenaire
// fantôme dans le catalogue.
const createdOrgs = [];
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "  OK  " : " ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function createUser(metadata) {
  const email = `smoke-${Date.now()}-${createdUsers.length}@enievent.test`;
  const password = `Smoke!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`création du compte : ${error.message}`);
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password };
}

try {
  // ---------------------------------------------------------------------------
  // Compte et profil
  // ---------------------------------------------------------------------------
  const user = await createUser({ full_name: "Compte de test", account_type: "particulier" });
  check("création du compte auth", true, user.id);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, account_type")
    .eq("id", user.id)
    .single();

  check(
    "déclencheur → profil créé avec ses métadonnées",
    !profileError && profile?.full_name === "Compte de test" && profile?.account_type === "particulier",
    profileError?.message ?? "",
  );

  // ---------------------------------------------------------------------------
  // RLS vue à travers PostgREST
  // ---------------------------------------------------------------------------
  const asUser = createClient(url, publishable, { auth: { persistSession: false } });
  const { error: signInError } = await asUser.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  check("connexion avec la clé publishable", !signInError, signInError?.message ?? "");

  const { data: visible } = await asUser.from("profiles").select("id");
  check(
    "un utilisateur ne voit que son profil",
    visible?.length === 1 && visible[0].id === user.id,
    `${visible?.length ?? 0} ligne(s)`,
  );

  const { data: anonProfiles } = await anon.from("profiles").select("id");
  check("un visiteur anonyme ne voit aucun profil", (anonProfiles?.length ?? 0) === 0);

  const { error: anonInsert } = await anon
    .from("organizations")
    .insert({ type: "partner", legal_name: "Tentative anonyme" });
  check("un visiteur anonyme ne peut pas créer d'organisation", Boolean(anonInsert));

  // ---------------------------------------------------------------------------
  // Catalogue public
  // ---------------------------------------------------------------------------
  const { data: listings, error: listingsError } = await anon
    .from("listings")
    .select("slug, title, city, kind, price_from");

  check(
    "catalogue lisible sans compte",
    !listingsError && (listings?.length ?? 0) >= 10,
    listingsError?.message ?? `${listings?.length ?? 0} annonce(s)`,
  );

  const cities = new Set((listings ?? []).map((l) => l.city));
  check(
    "les principales villes béninoises sont représentées",
    ["Cotonou", "Porto-Novo", "Abomey-Calavi", "Ouidah"].every((c) => cities.has(c)),
    [...cities].sort().join(", "),
  );

  const { data: referenceCities } = await anon.from("cities").select("name");
  const known = new Set((referenceCities ?? []).map((c) => c.name));
  const strays = [...cities].filter((c) => !known.has(c));
  check(
    "aucune annonce hors du référentiel béninois",
    strays.length === 0,
    strays.length ? `intruses : ${strays.join(", ")}` : "",
  );

  const { data: categories } = await anon.from("categories").select("slug, parent_id");
  const families = (categories ?? []).filter((c) => c.parent_id === null);
  check(
    "référentiel de catégories en place",
    families.length === 8 && (categories?.length ?? 0) >= 45,
    `${families.length} familles, ${categories?.length ?? 0} entrées`,
  );

  const target = listings?.[0];
  if (target) {
    await anon.from("listings").update({ title: "Piraté" }).eq("slug", target.slug);
    const { data: after } = await anon
      .from("listings")
      .select("title")
      .eq("slug", target.slug)
      .single();
    // Rappel : la clause USING masque la ligne, elle ne lève pas d'erreur.
    check("un visiteur ne peut pas modifier une annonce", after?.title === target.title);
  }

  // ---------------------------------------------------------------------------
  // Inscription partenaire : compte, organisation, appartenance et fiche
  // partenaire naissent dans la même transaction.
  // ---------------------------------------------------------------------------
  const partner = await createUser({
    full_name: "Test Partenaire",
    account_type: "partenaire",
    company_name: `Traiteur Test ${Date.now()}`,
    city: "Cotonou",
    country: "BJ",
  });

  const { data: membership } = await admin
    .from("organization_members")
    .select("org_id, role, org_type, organizations(slug, type, status)")
    .eq("user_id", partner.id)
    .maybeSingle();

  if (membership?.org_id) createdOrgs.push(membership.org_id);

  check(
    "organisation partenaire créée, le compte en est propriétaire",
    membership?.role === "owner" &&
      membership?.org_type === "partner" &&
      membership?.organizations?.status === "active",
    membership?.organizations?.slug ?? "aucune organisation",
  );

  if (membership?.org_id) {
    const { data: partnerProfile } = await admin
      .from("partner_profiles")
      .select("service_cities, is_verified")
      .eq("org_id", membership.org_id)
      .maybeSingle();

    check(
      "fiche partenaire pré-remplie et non vérifiée",
      partnerProfile?.is_verified === false &&
        (partnerProfile?.service_cities ?? []).includes("Cotonou"),
      JSON.stringify(partnerProfile),
    );
  }

  // ---------------------------------------------------------------------------
  // Élévation de privilèges
  // ---------------------------------------------------------------------------
  const pirate = await createUser({ full_name: "Pirate", account_type: "admin" });
  const { data: pirateProfile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", pirate.id)
    .single();

  check(
    "un compte ne peut pas se déclarer administrateur",
    pirateProfile?.account_type === "particulier",
    `reçu : ${pirateProfile?.account_type}`,
  );
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  // Les organisations d'abord : leur suppression emporte annonces et
  // appartenances par cascade.
  for (const orgId of createdOrgs) {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) console.log(`  purge de l'organisation ${orgId} : ÉCHEC (${error.message})`);
  }

  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  purge du compte ${id} : ÉCHEC (${error.message})`);
  }

  console.log(
    `  ${createdUsers.length} compte(s) et ${createdOrgs.length} organisation(s) de test supprimés`,
  );
}

console.log(failures === 0 ? "\nTout est vert." : `\n${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
