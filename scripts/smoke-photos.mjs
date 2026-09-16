import { createClient } from "@supabase/supabase-js";

/**
 * Photos, de bout en bout contre le vrai Supabase.
 *
 *   node --env-file=.env.local scripts/smoke-photos.mjs
 *
 * Le harnais PGlite **reproduit** le stockage ; il ne le remplace pas. Ce
 * contrôle vérifie le vrai seau, ses vraies politiques, et surtout que l'URL
 * publique est réellement lisible sans connexion — c'est elle que verront les
 * visiteurs.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = process.env.DEMO_PASSWORD;
const BUCKET = "annonces";

if (!url || !publishable || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

// PNG 1×1 transparent : le plus petit fichier qui reste une image valide.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let failures = 0;
let path = null;
let mediaId = null;
let previousCover;
let listingId = null;
let rivalUserId = null;
let rivalOrgId = null;

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

  const { data: membership } = await partner
    .from("organization_members")
    .select("org_id")
    .maybeSingle();
  const orgId = membership.org_id;

  const { data: listing } = await partner
    .from("listings")
    .select("id, title, cover_url")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  check("le partenaire a une annonce en ligne", Boolean(listing?.id), listing?.title);
  if (!listing) throw new Error("aucune annonce publiée — lancez npm run demo:reset");

  listingId = listing.id;
  previousCover = listing.cover_url;
  path = `${orgId}/${listingId}/essai-${Date.now()}.png`;

  // 1. Dépôt sous son propre dossier.
  const { error: uploadError } = await partner.storage
    .from(BUCKET)
    .upload(path, PIXEL, { contentType: "image/png" });

  check(
    "le partenaire dépose une photo sous son organisation",
    !uploadError,
    uploadError?.message ?? path,
  );

  // 2. L'URL publique est lisible sans connexion — c'est ce que verra un visiteur.
  const publicUrl = `${url.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
  const response = await fetch(publicUrl);

  check(
    "l'URL publique est lisible sans connexion",
    response.ok && Boolean(response.headers.get("content-type")?.includes("image")),
    `${response.status} ${response.headers.get("content-type") ?? ""}`,
  );

  // 3. Le registre : la ligne, puis la couverture.
  const { data: media, error: mediaError } = await partner
    .from("listing_media")
    .insert({ listing_id: listingId, storage_path: path, position: 900 })
    .select("id")
    .single();

  check("la photo est inscrite au registre", !mediaError, mediaError?.message ?? "");
  mediaId = media?.id ?? null;

  const { data: covered } = await partner
    .from("listings")
    .update({ cover_url: publicUrl })
    .eq("id", listingId)
    .select("cover_url")
    .single();

  check("la photo devient la couverture", covered?.cover_url === publicUrl);

  // 4. Un concurrent, créé pour l'occasion, ne doit pouvoir ni écrire ni effacer.
  const { data: intruder } = await admin.auth.admin.createUser({
    email: `rival-photos-${Date.now()}@enievent.test`,
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

  const rival = await signIn(intruder.user.email);

  const { error: intrusion } = await rival.storage
    .from(BUCKET)
    .upload(`${orgId}/${listingId}/intrus-${Date.now()}.png`, PIXEL, { contentType: "image/png" });

  check(
    "un concurrent ne peut pas déposer dans le dossier d'autrui",
    Boolean(intrusion),
    intrusion ? "refus de la politique" : "AUCUN REFUS — faille",
  );

  await rival.storage.from(BUCKET).remove([path]);
  const stillThere = await fetch(publicUrl);

  check(
    "un concurrent ne peut pas effacer la photo d'autrui",
    stillThere.ok,
    "la photo est toujours en ligne",
  );

  // 5. Le propriétaire, lui, efface la sienne.
  const { error: ownDelete } = await partner.storage.from(BUCKET).remove([path]);
  check("le propriétaire efface sa photo", !ownDelete, ownDelete?.message ?? "");

  // Le stockage fait foi. Interroger l'URL publique juste après une suppression
  // ne prouve rien : le CDN sert encore l'objet quelques minutes.
  const { data: remaining } = await partner.storage.from(BUCKET).list(`${orgId}/${listingId}`);
  const fileName = path.split("/").pop();

  check(
    "la photo n'est plus dans le stockage",
    !(remaining ?? []).some((object) => object.name === fileName),
  );

  // Contournement du cache, pour distinguer « encore servi » de « toujours là ».
  const fresh = await fetch(`${publicUrl}?cache=${Date.now()}`);
  check(
    "l'origine ne sert plus la photo",
    !fresh.ok,
    `${fresh.status}${fresh.ok ? " — le CDN conserve encore l'objet" : ""}`,
  );

  path = null;
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  if (mediaId) await admin.from("listing_media").delete().eq("id", mediaId);
  if (path) await admin.storage.from(BUCKET).remove([path]);
  if (listingId && previousCover !== undefined) {
    await admin.from("listings").update({ cover_url: previousCover }).eq("id", listingId);
  }
  if (rivalOrgId) await admin.from("organizations").delete().eq("id", rivalOrgId);
  if (rivalUserId) await admin.auth.admin.deleteUser(rivalUserId);

  console.log("  photo d'essai purgée, couverture restaurée");
}

console.log(failures === 0 ? "\nPhotos : tout est vert." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
