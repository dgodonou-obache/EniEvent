import { createClient } from "@supabase/supabase-js";

/**
 * Jeu de démonstration de l'espace entreprise.
 *
 *   node --env-file=.env.local scripts/seed-demo-entreprise.mjs
 *
 * Crée deux centres de coûts avec leur enveloppe, un seuil de validation, un
 * appel d'offres imputé, et une offre au-dessus du seuil en attente d'aval.
 * Sans cela, budgets et validations s'ouvrent vides et ne montrent rien.
 *
 * Rejouable : la demande précédente est supprimée avant d'être recréée.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

const TITLE = "Séminaire de direction — 60 personnes";
const THRESHOLD = 1_500_000;

const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const byEmail = Object.fromEntries(users.users.map((user) => [user.email, user.id]));

const clientId = byEmail["demo-entreprise@enievent.bj"];
const partnerId = byEmail["demo-partenaire@enievent.bj"];

if (!clientId || !partnerId) {
  console.error("Comptes de démonstration absents. Lancez d'abord npm run demo:users.");
  process.exit(1);
}

const { data: membership } = await admin
  .from("organization_members")
  .select("org_id, role")
  .eq("user_id", clientId)
  .maybeSingle();

if (!membership) {
  console.error("Le compte entreprise n'est rattaché à aucune organisation.");
  process.exit(1);
}

const orgId = membership.org_id;

await admin.from("quote_requests").delete().eq("org_id", orgId).eq("title", TITLE);

// 1. Le circuit de validation.
await admin
  .from("company_settings")
  .upsert(
    { org_id: orgId, approval_threshold: THRESHOLD, approve_publication: false },
    { onConflict: "org_id" },
  );

// 2. Les enveloppes.
const { data: centers } = await admin
  .from("cost_centers")
  .upsert(
    [
      {
        org_id: orgId,
        code: "MKT-2026",
        name: "Événements marketing",
        budget_amount: 15_000_000,
        period_start: "2026-01-01",
        period_end: "2026-12-31",
      },
      {
        org_id: orgId,
        code: "RH-2026",
        name: "Vie d'entreprise",
        budget_amount: 8_000_000,
        period_start: "2026-01-01",
        period_end: "2026-12-31",
      },
    ],
    { onConflict: "org_id,code" },
  )
  .select("id, code");

const marketing = centers.find((center) => center.code === "MKT-2026");

// 3. L'annonce du partenaire, dont la catégorie décide de qui verra la demande.
const { data: partnerMembership } = await admin
  .from("organization_members")
  .select("org_id")
  .eq("user_id", partnerId)
  .maybeSingle();

const { data: listing } = await admin
  .from("listings")
  .select("id, category_id, city")
  .eq("org_id", partnerMembership.org_id)
  .eq("status", "approved")
  .limit(1)
  .maybeSingle();

if (!listing) {
  console.error("Le partenaire de démonstration n'a aucune annonce publiée. Lancez npm run db:seed.");
  process.exit(1);
}

const { data: traiteur } = await admin
  .from("categories")
  .select("id")
  .eq("slug", "traiteur")
  .single();

// 4. L'appel d'offres, imputé sur le centre de coût marketing.
const { data: request } = await admin
  .from("quote_requests")
  .insert({
    requester_id: clientId,
    org_id: orgId,
    cost_center_id: marketing.id,
    title: TITLE,
    event_type: "seminaire",
    event_date: new Date(Date.now() + 55 * 86_400_000).toISOString().slice(0, 10),
    city: listing.city,
    guests: 60,
    budget_max: 3_500_000,
    description:
      "Séminaire de direction sur une journée : plénière le matin, déjeuner assis, " +
      "ateliers l'après-midi. Nous cherchons un lieu climatisé avec sonorisation, " +
      "ainsi qu'un traiteur pour la journée.",
    status: "draft",
    respond_by: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  })
  .select("id, reference")
  .single();

const { data: items } = await admin
  .from("quote_request_items")
  .insert([
    { request_id: request.id, category_id: listing.category_id, budget_max: 2_000_000 },
    { request_id: request.id, category_id: traiteur.id, budget_max: 1_200_000 },
  ])
  .select("id, category_id");

await admin.from("quote_requests").update({ status: "open" }).eq("id", request.id);

// 5. Une offre au-dessus du seuil, pour que l'écran de validation ait un cas.
const servedItem = items.find((item) => item.category_id === listing.category_id);

const { data: quote } = await admin
  .from("quotes")
  .insert({
    item_id: servedItem.id,
    org_id: partnerMembership.org_id,
    listing_id: listing.id,
    message:
      "Notre espace accueille 60 personnes en configuration séminaire. " +
      "Climatisation, sonorisation et vidéoprojecteur inclus.",
    valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  })
  .select("id")
  .single();

await admin.from("quote_lines").insert([
  {
    quote_id: quote.id,
    position: 0,
    label: "Location de la salle, journée complète",
    quantity: 1,
    unit: "day",
    unit_price: 1_600_000,
  },
  {
    quote_id: quote.id,
    position: 1,
    label: "Sonorisation et vidéoprojection",
    quantity: 1,
    unit: "forfait",
    unit_price: 250_000,
  },
]);

await admin.from("quotes").update({ status: "sent" }).eq("id", quote.id);

const { data: sent } = await admin
  .from("quotes")
  .select("subtotal")
  .eq("id", quote.id)
  .single();

// 6. L'aval en attente. Inséré directement : `request_quote_approval` lit
// `auth.uid()`, qui est nul avec la clé de service.
await admin.from("approvals").insert({
  org_id: orgId,
  subject: "quote",
  subject_id: quote.id,
  amount: sent.subtotal,
  currency: "XOF",
  cost_center_id: marketing.id,
  requested_by: clientId,
});

console.log(`Espace entreprise de démonstration prêt : ${request.reference}`);
console.log(`  · seuil de validation : ${THRESHOLD.toLocaleString("fr-FR")} FCFA`);
console.log(`  · 2 centres de coûts, 23 000 000 FCFA d'enveloppe`);
console.log(
  `  · 1 offre à ${sent.subtotal.toLocaleString("fr-FR")} FCFA en attente d'aval (au-dessus du seuil)`,
);
console.log(`  · rôle du compte de démonstration : ${membership.role}`);
