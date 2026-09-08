import { createClient } from "@supabase/supabase-js";

/**
 * Appel d'offres, de bout en bout contre le vrai Supabase.
 *
 *   node --env-file=.env.local scripts/smoke-devis.mjs
 *
 * Un client publie un brief, deux prestataires concurrents y répondent, le
 * client compare et choisit. Ce que ce contrôle prouve et qu'aucun test manuel
 * ne prouverait : les offres sont scellées entre concurrents, le client ne voit
 * pas les brouillons, et une acceptation refuse les rivaux dans la même
 * transaction.
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
let requestId = null;
let rivalUserId = null;
let rivalOrgId = null;
let rivalListingId = null;

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
  const client = await signIn("demo-particulier@enievent.bj");
  const partner = await signIn("demo-partenaire@enievent.bj");

  const { data: me } = await client.auth.getUser();
  const { data: membership } = await partner
    .from("organization_members")
    .select("org_id")
    .maybeSingle();

  // On se cale sur une annonce réelle du partenaire : sa catégorie et sa ville
  // décident de ce qu'il a le droit de voir.
  const { data: listing } = await partner
    .from("listings")
    .select("id, title, category_id, city, kind")
    .eq("org_id", membership.org_id)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  check("le partenaire a une annonce en ligne", Boolean(listing?.id), listing?.title);
  if (!listing) throw new Error("aucune annonce publiée — lancez npm run demo:reset");

  // 1. Le client publie son brief.
  const { data: created, error: createError } = await client
    .from("quote_requests")
    .insert({
      requester_id: me.user.id,
      title: `Contrôle automatique — ${new Date().toISOString().slice(0, 16)}`,
      event_type: "seminaire",
      event_date: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      city: listing.city,
      guests: 120,
      budget_max: 3_000_000,
      description:
        "Brief créé par le contrôle automatique de l'appel d'offres. Il est supprimé à la fin.",
      respond_by: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    })
    .select("id, reference, status")
    .single();

  check("le client dépose un brief", !createError, createError?.message ?? created?.reference);
  requestId = created?.id ?? null;

  check("la référence est lisible", /^DEM-\d{6}-\d{6}$/.test(created?.reference ?? ""));

  const { data: item, error: itemError } = await client
    .from("quote_request_items")
    .insert({ request_id: requestId, category_id: listing.category_id })
    .select("id")
    .single();

  check("le brief porte un besoin", !itemError, itemError?.message ?? "");

  // 2. Publication : c'est une transition d'état, gardée par un déclencheur.
  const { data: published } = await client
    .from("quote_requests")
    .update({ status: "open" })
    .eq("id", requestId)
    .select("status, published_at, respond_by")
    .single();

  check(
    "la publication est horodatée",
    published?.status === "open" && Boolean(published?.published_at),
  );

  // 3. Le partenaire voit le besoin.
  const { data: visible } = await partner
    .from("quote_request_items")
    .select("id")
    .eq("id", item.id);

  check("le partenaire voit la demande", (visible?.length ?? 0) === 1);

  // 4. Un concurrent de la même catégorie, créé pour l'occasion.
  const { data: intruder } = await admin.auth.admin.createUser({
    email: `rival-devis-${Date.now()}@enievent.test`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { account_type: "partenaire", company_name: `Rival ${Date.now()}` },
  });
  rivalUserId = intruder.user.id;

  const { data: rivalMembership } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", rivalUserId)
    .maybeSingle();
  rivalOrgId = rivalMembership?.org_id ?? null;

  // Créée avec la clé de service : le déclencheur de modération ne s'oppose
  // qu'à une auto-validation par un utilisateur authentifié.
  const { data: rivalListing } = await admin
    .from("listings")
    .insert({
      org_id: rivalOrgId,
      category_id: listing.category_id,
      kind: listing.kind,
      title: "Offre concurrente d'essai",
      slug: `rival-essai-${Date.now()}`,
      city: listing.city,
      status: "approved",
    })
    .select("id")
    .single();
  rivalListingId = rivalListing?.id ?? null;

  const rival = await signIn(intruder.user.email);

  // 5. Les deux rédigent leur devis.
  const mine = await draft(partner, item.id, membership.org_id, 1_500_000);
  const theirs = await draft(rival, item.id, rivalOrgId, 2_100_000);

  check("le total est recalculé depuis les lignes", mine.subtotal === 1_500_000);

  // 6. Le client ne voit pas les brouillons.
  const { data: drafts } = await client
    .from("quotes")
    .select("id")
    .eq("item_id", item.id);

  check("le client ne voit aucun brouillon", (drafts?.length ?? 0) === 0);

  // 7. Chacun envoie ; personne ne voit l'offre de l'autre.
  await partner.from("quotes").update({ status: "sent" }).eq("id", mine.id);
  await rival.from("quotes").update({ status: "sent" }).eq("id", theirs.id);

  const { data: spied } = await partner.from("quotes").select("id").eq("id", theirs.id);
  check("un partenaire ne voit pas l'offre du concurrent", (spied?.length ?? 0) === 0);

  const { data: spiedLines } = await partner
    .from("quote_lines")
    .select("id")
    .eq("quote_id", theirs.id);
  check("ni le détail de ses lignes", (spiedLines?.length ?? 0) === 0);

  // 8. Le client, lui, compare les deux.
  const { data: received } = await client
    .from("quotes")
    .select("id, subtotal, status")
    .eq("item_id", item.id)
    .order("subtotal");

  check(
    "le client reçoit les deux offres, classées par prix",
    received?.length === 2 && received[0].subtotal === 1_500_000,
    received ? `${received.map((q) => q.subtotal).join(" puis ")}` : "",
  );

  // 9. Les lignes se figent une fois envoyées.
  const { data: tampered } = await partner
    .from("quote_lines")
    .update({ unit_price: 1 })
    .eq("quote_id", mine.id)
    .select("id");

  check("les lignes d'un devis envoyé ne bougent plus", (tampered?.length ?? 0) === 0);

  // 10. Acceptation : jamais par un UPDATE direct.
  const { error: directAccept } = await client
    .from("quotes")
    .update({ status: "accepted" })
    .eq("id", mine.id);

  check(
    "un devis ne s'accepte pas par simple mise à jour",
    Boolean(directAccept),
    directAccept ? "refus du déclencheur" : "AUCUN REFUS — faille",
  );

  const { error: acceptError } = await client.rpc("accept_quote", { target: mine.id });
  check("l'acceptation passe par accept_quote", !acceptError, acceptError?.message ?? "");

  const { data: after } = await client
    .from("quotes")
    .select("id, status")
    .eq("item_id", item.id);

  const byId = Object.fromEntries((after ?? []).map((q) => [q.id, q.status]));
  check("l'offre retenue est acceptée", byId[mine.id] === "accepted");
  check("l'offre rivale est refusée d'office", byId[theirs.id] === "declined");

  const { data: awarded } = await client
    .from("quote_request_items")
    .select("awarded_quote_id")
    .eq("id", item.id)
    .single();
  check("le besoin est attribué", awarded?.awarded_quote_id === mine.id);

  const { data: finalRequest } = await client
    .from("quote_requests")
    .select("status")
    .eq("id", requestId)
    .single();
  check("la demande passe en « attribuée »", finalRequest?.status === "awarded");

  // 11. Le journal d'audit garde la trace, et reste fermé au client.
  const { data: journal } = await admin
    .from("audit_logs")
    .select("action, to_state, actor_id")
    .eq("entity_id", mine.id);
  check("l'acceptation est journalisée", (journal?.length ?? 0) === 1);

  const { data: peeked } = await client.from("audit_logs").select("id").eq("entity_id", mine.id);
  check("le journal reste fermé au client", (peeked?.length ?? 0) === 0);
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  if (requestId) {
    // La cascade emporte besoins, devis et lignes.
    await admin.from("quote_requests").delete().eq("id", requestId);
    console.log("  brief d'essai supprimé");
  }
  if (rivalListingId) await admin.from("listings").delete().eq("id", rivalListingId);
  if (rivalOrgId) await admin.from("organizations").delete().eq("id", rivalOrgId);
  if (rivalUserId) await admin.auth.admin.deleteUser(rivalUserId);
}

/** Crée un devis avec une ligne et renvoie son identifiant et son total. */
async function draft(as, itemId, orgId, price) {
  const { data: quote, error } = await as
    .from("quotes")
    .insert({ item_id: itemId, org_id: orgId, message: "Proposition d'essai." })
    .select("id")
    .single();

  if (error) throw new Error(`devis impossible : ${error.message}`);

  const { error: lineError } = await as.from("quote_lines").insert({
    quote_id: quote.id,
    label: "Prestation complète",
    quantity: 1,
    unit: "forfait",
    unit_price: price,
  });

  if (lineError) throw new Error(`ligne impossible : ${lineError.message}`);

  const { data: refreshed } = await as
    .from("quotes")
    .select("id, subtotal")
    .eq("id", quote.id)
    .single();

  return refreshed;
}

console.log(failures === 0 ? "\nAppel d'offres : tout est vert." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
