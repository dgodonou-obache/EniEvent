import { createClient } from "@supabase/supabase-js";

/**
 * Boucle de l'offre, de bout en bout contre le vrai Supabase.
 *
 *   node --env-file=.env.local scripts/smoke-supply-loop.mjs
 *
 * Un partenaire crée une annonce, tente de se valider lui-même, la soumet ;
 * un administrateur la valide ; elle apparaît alors au catalogue public. C'est
 * exactement le parcours que le back-office rend possible — vérifié ici avec
 * les mêmes politiques RLS et les mêmes déclencheurs qu'en production.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = "Demo!EniEvent2026";

if (!url || !publishable || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
let failures = 0;
let listingId = null;

function check(label, ok, detail = "") {
  console.log(`${ok ? "  OK  " : " ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function signIn(email) {
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`connexion ${email} : ${error.message} — lancez npm run demo:users`);
  return client;
}

try {
  const partner = await signIn("demo-partenaire@enievent.bj");
  const ops = await signIn("demo-admin@enievent.bj");
  const anon = createClient(url, publishable, { auth: { persistSession: false } });

  // Le partenaire retrouve son organisation et une catégorie de lieu.
  const { data: membership } = await partner
    .from("organization_members")
    .select("org_id")
    .maybeSingle();
  check("le partenaire est rattaché à une organisation", Boolean(membership?.org_id));

  const { data: category } = await anon
    .from("categories")
    .select("id, kind")
    .eq("slug", "salle-de-reception")
    .single();

  const slug = `essai-boucle-${Date.now()}`;

  // 1. Création du brouillon
  const { data: created, error: createError } = await partner
    .from("listings")
    .insert({
      org_id: membership.org_id,
      category_id: category.id,
      kind: category.kind,
      title: "Salle d'essai — boucle de l'offre",
      slug,
      city: "Cotonou",
      status: "draft",
      description:
        "Annonce créée par le contrôle automatique de la boucle de l'offre. Elle est supprimée à la fin du test.",
      booking_mode: "both",
    })
    .select("id, status")
    .single();

  check("le partenaire crée un brouillon", !createError, createError?.message ?? "");
  listingId = created?.id ?? null;

  // 2. Le brouillon reste invisible du public
  const { data: hidden } = await anon.from("listing_search").select("slug").eq("slug", slug);
  check("le brouillon reste invisible du public", (hidden?.length ?? 0) === 0);

  // 3. Auto-validation : le déclencheur doit s'y opposer
  const { error: selfApprove } = await partner
    .from("listings")
    .update({ status: "approved" })
    .eq("id", listingId);

  check(
    "le partenaire ne peut pas valider sa propre annonce",
    Boolean(selfApprove),
    selfApprove ? "refus explicite du déclencheur" : "AUCUN REFUS — faille",
  );

  // 4. Soumission à la validation
  const { data: submitted } = await partner
    .from("listings")
    .update({ status: "pending" })
    .eq("id", listingId)
    .select("status")
    .single();

  check("le partenaire soumet son annonce", submitted?.status === "pending");

  // 5. L'annonce apparaît dans la file de modération
  const { data: queue } = await ops
    .from("listings")
    .select("id")
    .eq("status", "pending")
    .eq("id", listingId);

  check("l'annonce entre dans la file de modération", (queue?.length ?? 0) === 1);

  // 6. Validation par l'administrateur
  const { data: approved, error: approveError } = await ops
    .from("listings")
    .update({ status: "approved" })
    .eq("id", listingId)
    .select("status, published_at")
    .single();

  check("l'administrateur valide l'annonce", approved?.status === "approved", approveError?.message ?? "");
  check("la publication est horodatée", Boolean(approved?.published_at));

  // 7. L'annonce apparaît enfin au catalogue public
  const { data: visible } = await anon
    .from("listing_search")
    .select("slug, org_name, category_name")
    .eq("slug", slug);

  check(
    "l'annonce apparaît au catalogue public",
    (visible?.length ?? 0) === 1,
    visible?.[0] ? `${visible[0].category_name} · ${visible[0].org_name}` : "absente",
  );

  // 8. Un autre partenaire ne doit pas pouvoir la modifier
  const { data: intruder } = await admin.auth.admin.createUser({
    email: `intrus-${Date.now()}@enievent.test`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { account_type: "partenaire", company_name: `Intrus ${Date.now()}` },
  });

  const rival = await signInAs(intruder.user.email);
  const { data: tampered } = await rival
    .from("listings")
    .update({ title: "Détourné" })
    .eq("id", listingId)
    .select("id");

  check(
    "un partenaire concurrent ne peut pas la modifier",
    (tampered?.length ?? 0) === 0,
    "0 ligne modifiée",
  );

  // Purge de l'intrus et de son organisation
  const { data: rivalOrg } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", intruder.user.id)
    .maybeSingle();
  if (rivalOrg?.org_id) await admin.from("organizations").delete().eq("id", rivalOrg.org_id);
  await admin.auth.admin.deleteUser(intruder.user.id);
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  if (listingId) {
    const { error } = await admin.from("listings").delete().eq("id", listingId);
    console.log(error ? `  purge : ÉCHEC (${error.message})` : "  annonce d'essai supprimée");
  }
}

async function signInAs(email) {
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  return client;
}

console.log(failures === 0 ? "\nBoucle complète : tout est vert." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
