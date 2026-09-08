import { createClient } from "@supabase/supabase-js";

/**
 * Planning partenaire, de bout en bout contre le vrai Supabase.
 *
 *   node --env-file=.env.local scripts/smoke-planning.mjs
 *
 * Vérifie ce qui ne se teste pas à la main : que le prix plancher est bien
 * opposé côté base et non seulement côté formulaire, qu'une date fermée
 * conserve son tarif, et qu'un partenaire concurrent ne peut pas toucher au
 * planning d'autrui.
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
let previousMinPrice = null;
let rivalUserId = null;

// Au-delà des six mois du jeu de démonstration : la date est forcément vierge.
const TARGET = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);

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
  const anon = createClient(url, publishable, { auth: { persistSession: false } });

  const { data: membership } = await partner
    .from("organization_members")
    .select("org_id")
    .maybeSingle();

  const { data: listing } = await partner
    .from("listings")
    .select("id, title, min_price")
    .eq("org_id", membership.org_id)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  check("le partenaire a une annonce en ligne à planifier", Boolean(listing?.id), listing?.title);
  if (!listing) throw new Error("aucune annonce publiée — lancez npm run demo:reset");

  listingId = listing.id;
  previousMinPrice = listing.min_price;

  // 1. La date lointaine n'est pas renseignée : invisible à la réservation.
  const { data: before } = await partner
    .from("availabilities")
    .select("id")
    .eq("listing_id", listingId)
    .eq("date", TARGET);

  check("la date lointaine n'est pas encore ouverte", (before?.length ?? 0) === 0, TARGET);

  // 2. Prix plancher posé sur l'annonce.
  const { error: floorError } = await partner
    .from("listings")
    .update({ min_price: 100_000 })
    .eq("id", listingId);

  check("le partenaire fixe son prix plancher", !floorError, floorError?.message ?? "100 000 FCFA");

  // 3. Ouverture sous le plancher : la base doit refuser, pas seulement l'écran.
  const { error: tooCheap } = await partner.from("availabilities").insert({
    listing_id: listingId,
    date: TARGET,
    slot: "journee",
    status: "open",
    price: 15_000,
    inventory: 1,
  });

  check(
    "la base refuse un tarif sous le prix plancher",
    Boolean(tooCheap),
    tooCheap ? "refus du déclencheur" : "AUCUN REFUS — le garde-fou ne tient pas",
  );

  // 4. Ouverture au-dessus du plancher.
  const { data: opened, error: openError } = await partner
    .from("availabilities")
    .upsert(
      {
        listing_id: listingId,
        date: TARGET,
        slot: "journee",
        status: "open",
        price: 150_000,
        inventory: 1,
      },
      { onConflict: "listing_id,date,slot" },
    )
    .select("id, status, price")
    .single();

  check(
    "le partenaire ouvre la date au tarif choisi",
    opened?.status === "open" && opened?.price === 150_000,
    openError?.message ?? "150 000 FCFA",
  );

  // 5. La date ouverte est lisible par un visiteur non connecté.
  const { data: publicRow } = await anon
    .from("availabilities")
    .select("date, status, price")
    .eq("listing_id", listingId)
    .eq("date", TARGET)
    .maybeSingle();

  check("un visiteur voit la date ouverte", publicRow?.status === "open");

  // 6. Fermeture : la date sort des recherches mais garde son tarif.
  const { data: closed } = await partner
    .from("availabilities")
    .update({ status: "closed" })
    .eq("listing_id", listingId)
    .eq("date", TARGET)
    .select("status, price")
    .single();

  check("la fermeture conserve le tarif saisi", closed?.status === "closed" && closed?.price === 150_000);

  // 7. Un partenaire concurrent ne doit toucher à rien.
  const { data: intruder } = await admin.auth.admin.createUser({
    email: `intrus-planning-${Date.now()}@enievent.test`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { account_type: "partenaire", company_name: `Intrus ${Date.now()}` },
  });

  rivalUserId = intruder.user.id;
  const rival = await signIn(intruder.user.email);

  const { error: rivalInsert } = await rival.from("availabilities").insert({
    listing_id: listingId,
    date: TARGET,
    slot: "matin",
    status: "open",
    price: 500_000,
    inventory: 1,
  });

  check(
    "un concurrent ne peut pas ouvrir de date sur cette annonce",
    Boolean(rivalInsert),
    rivalInsert ? "refus de la RLS" : "AUCUN REFUS — faille",
  );

  const { data: rivalUpdate } = await rival
    .from("availabilities")
    .update({ price: 1 })
    .eq("listing_id", listingId)
    .eq("date", TARGET)
    .select("id");

  // Rappel : un UPDATE bloqué par une clause USING ne lève pas d'erreur — la
  // ligne est simplement invisible. Seul le nombre de lignes le révèle.
  check(
    "un concurrent ne peut pas modifier le tarif d'autrui",
    (rivalUpdate?.length ?? 0) === 0,
    "0 ligne modifiée",
  );
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  if (listingId) {
    await admin.from("availabilities").delete().eq("listing_id", listingId).eq("date", TARGET);
    await admin.from("listings").update({ min_price: previousMinPrice }).eq("id", listingId);
    console.log("  planning d'essai purgé, prix plancher restauré");
  }

  if (rivalUserId) {
    const { data: rivalOrg } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", rivalUserId)
      .maybeSingle();

    if (rivalOrg?.org_id) await admin.from("organizations").delete().eq("id", rivalOrg.org_id);
    await admin.auth.admin.deleteUser(rivalUserId);
  }
}

console.log(failures === 0 ? "\nPlanning : tout est vert." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
