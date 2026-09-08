import { createClient } from "@supabase/supabase-js";

/**
 * Jeu de démonstration de l'appel d'offres.
 *
 *   node --env-file=.env.local scripts/seed-demo-devis.mjs
 *
 * Crée un brief ouvert au nom du compte particulier de démonstration, et une
 * offre déjà envoyée par le partenaire de démonstration. Sans cela, les deux
 * écrans les plus intéressants — le comparateur du client et la file de
 * demandes du partenaire — s'ouvrent vides.
 *
 * Rejouable : le brief précédent est supprimé avant d'être recréé.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

// Repère de rejouabilité : ce titre identifie le brief de démonstration.
const TITLE = "Séminaire annuel — 150 personnes";

const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const byEmail = Object.fromEntries(users.users.map((user) => [user.email, user.id]));

const clientId = byEmail["demo-particulier@enievent.bj"];
if (!clientId) {
  console.error("Compte de démonstration absent. Lancez d'abord npm run demo:users.");
  process.exit(1);
}

await admin.from("quote_requests").delete().eq("requester_id", clientId).eq("title", TITLE);

// Le partenaire de démonstration, et l'une de ses annonces publiées : c'est sa
// catégorie qui décide de ce qu'il verra.
const partnerId = byEmail["demo-partenaire@enievent.bj"];
const { data: membership } = await admin
  .from("organization_members")
  .select("org_id")
  .eq("user_id", partnerId)
  .maybeSingle();

const { data: listing } = await admin
  .from("listings")
  .select("id, category_id, city")
  .eq("org_id", membership.org_id)
  .eq("status", "approved")
  .limit(1)
  .maybeSingle();

if (!listing) {
  console.error("Le partenaire de démonstration n'a aucune annonce publiée. Lancez npm run db:seed.");
  process.exit(1);
}

// Un second besoin, dans une catégorie que le partenaire ne couvre pas : le
// comparateur montre ainsi à la fois une prestation servie et une en attente.
const { data: traiteur } = await admin
  .from("categories")
  .select("id")
  .eq("slug", "traiteur")
  .single();

const { data: request } = await admin
  .from("quote_requests")
  .insert({
    requester_id: clientId,
    title: TITLE,
    event_type: "seminaire",
    event_date: new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10),
    city: listing.city,
    district: "Haie Vive",
    guests: 150,
    budget_max: 4_500_000,
    description:
      "Séminaire annuel de notre entreprise sur une journée : accueil café à 8 h, " +
      "plénière le matin, déjeuner assis, ateliers l'après-midi et cocktail de clôture. " +
      "Nous cherchons un lieu climatisé avec sonorisation et vidéoprojecteur, ainsi " +
      "qu'un traiteur pour la journée complète.",
    contact_phone: "+22901970000 01".replace(/\s/g, ""),
    status: "draft",
    respond_by: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  })
  .select("id, reference")
  .single();

const { data: items } = await admin
  .from("quote_request_items")
  .insert([
    {
      request_id: request.id,
      category_id: listing.category_id,
      notes: "Journée complète, 8 h - 22 h.",
      // Enveloppe par prestation : c'est elle qui parle au prestataire, pas le
      // budget global de l'événement.
      budget_max: 1_800_000,
    },
    {
      request_id: request.id,
      category_id: traiteur.id,
      notes: "Déjeuner assis + cocktail.",
      budget_max: 2_400_000,
    },
  ])
  .select("id, category_id");

// Publication par le chemin normal : le déclencheur pose la date de publication.
await admin.from("quote_requests").update({ status: "open" }).eq("id", request.id);

// Une offre déjà envoyée, pour que le comparateur ait quelque chose à comparer.
const servedItem = items.find((item) => item.category_id === listing.category_id);

const { data: quote } = await admin
  .from("quotes")
  .insert({
    item_id: servedItem.id,
    org_id: membership.org_id,
    listing_id: listing.id,
    message:
      "Bonjour, notre espace accueille sans difficulté 150 personnes en configuration " +
      "séminaire. Climatisation, sonorisation et vidéoprojecteur sont inclus. " +
      "Nous restons à votre disposition pour une visite.",
    valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  })
  .select("id")
  .single();

await admin.from("quote_lines").insert([
  {
    quote_id: quote.id,
    position: 0,
    label: "Location de la salle, journée complète",
    description: "8 h - 22 h, climatisation et groupe électrogène inclus",
    quantity: 1,
    unit: "day",
    unit_price: 850_000,
  },
  {
    quote_id: quote.id,
    position: 1,
    label: "Sonorisation et vidéoprojection",
    quantity: 1,
    unit: "forfait",
    unit_price: 175_000,
  },
  {
    quote_id: quote.id,
    position: 2,
    label: "Personnel d'accueil",
    quantity: 3,
    unit: "person",
    unit_price: 25_000,
  },
]);

await admin.from("quotes").update({ status: "sent" }).eq("id", quote.id);

const { data: final } = await admin
  .from("quotes")
  .select("subtotal")
  .eq("id", quote.id)
  .single();

console.log(`Brief de démonstration créé : ${request.reference}`);
console.log(`  · 2 prestations demandées, 1 offre reçue (${final.subtotal.toLocaleString("fr-FR")} FCFA)`);
console.log(`  · côté client    : /projets/${request.id}`);
console.log("  · côté partenaire : /pro/demandes");
