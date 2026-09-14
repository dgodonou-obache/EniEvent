import { createClient } from "@supabase/supabase-js";

/**
 * Espace entreprise, de bout en bout contre le vrai Supabase.
 *
 *   node --env-file=.env.local scripts/smoke-entreprise.mjs
 *
 * Vérifie ce qu'aucun test manuel ne vérifierait : qu'un organisateur ne peut
 * pas s'auto-valider, qu'une entreprise ne voit pas les engagements d'une
 * autre, et que l'aval accordé retient l'offre dans la même transaction.
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
let costCenterId = null;
let organizerId = null;
let companyOrgId = null;
let previousThreshold;

const THRESHOLD = 1_000_000;
const CODE = `ESSAI-${Date.now().toString().slice(-6)}`;

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
  const owner = await signIn("demo-entreprise@enievent.bj");
  const partner = await signIn("demo-partenaire@enievent.bj");

  const { data: me } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("organization_members")
    .select("org_id, role")
    .maybeSingle();

  const orgId = membership.org_id;
  companyOrgId = orgId;
  check("le compte entreprise est rattaché", Boolean(orgId), `rôle ${membership.role}`);

  // Seuil de l'essai, l'ancien est restauré à la fin.
  const { data: settings } = await admin
    .from("company_settings")
    .select("approval_threshold")
    .eq("org_id", orgId)
    .maybeSingle();
  previousThreshold = settings?.approval_threshold ?? null;

  await admin
    .from("company_settings")
    .upsert({ org_id: orgId, approval_threshold: THRESHOLD }, { onConflict: "org_id" });

  // 1. Un centre de coût avec son enveloppe.
  const { data: center, error: centerError } = await owner
    .from("cost_centers")
    .insert({ org_id: orgId, code: CODE, name: "Contrôle automatique", budget_amount: 5_000_000 })
    .select("id")
    .single();

  check("l'entreprise crée un centre de coût", !centerError, centerError?.message ?? CODE);
  costCenterId = center?.id ?? null;

  // 2. Un appel d'offres imputé dessus.
  const { data: partnerMembership } = await partner
    .from("organization_members")
    .select("org_id")
    .maybeSingle();

  const { data: listing } = await partner
    .from("listings")
    .select("id, category_id, city")
    .eq("org_id", partnerMembership.org_id)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  const { data: request, error: requestError } = await owner
    .from("quote_requests")
    .insert({
      requester_id: me.user.id,
      org_id: orgId,
      cost_center_id: costCenterId,
      title: `Contrôle entreprise — ${new Date().toISOString().slice(0, 16)}`,
      event_type: "seminaire",
      event_date: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
      city: listing.city,
      description: "Demande créée par le contrôle automatique. Supprimée à la fin.",
      respond_by: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    })
    .select("id")
    .single();

  check("la demande est imputée sur le centre de coût", !requestError, requestError?.message ?? "");
  requestId = request?.id ?? null;

  const { data: item } = await owner
    .from("quote_request_items")
    .insert({ request_id: requestId, category_id: listing.category_id })
    .select("id")
    .single();

  await owner.from("quote_requests").update({ status: "open" }).eq("id", requestId);

  // 3. Une offre au-dessus du seuil.
  const { data: quote } = await partner
    .from("quotes")
    .insert({ item_id: item.id, org_id: partnerMembership.org_id })
    .select("id")
    .single();

  await partner.from("quote_lines").insert({
    quote_id: quote.id,
    label: "Prestation d'essai",
    quantity: 1,
    unit: "forfait",
    unit_price: 2_400_000,
  });
  await partner.from("quotes").update({ status: "sent" }).eq("id", quote.id);

  // 4. L'acceptation directe est refusée.
  const { error: directAccept } = await owner.rpc("accept_quote", { target: quote.id });
  check(
    "une offre au-dessus du seuil ne s'accepte pas directement",
    Boolean(directAccept),
    directAccept ? "refus explicite" : "AUCUN REFUS — le seuil ne tient pas",
  );

  // 5. Demande d'aval.
  const { data: approvalId, error: askError } = await owner.rpc("request_quote_approval", {
    target: quote.id,
  });
  check("l'organisateur demande l'aval", !askError && Boolean(approvalId), askError?.message ?? "");

  // 6. Un organisateur sans droit de valider ne décide pas.
  const { data: created } = await admin.auth.admin.createUser({
    email: `organisateur-${Date.now()}@enievent.test`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { account_type: "entreprise" },
  });
  organizerId = created.user.id;

  await admin
    .from("organization_members")
    .insert({ org_id: orgId, org_type: "company", user_id: organizerId, role: "organizer" });

  const organizer = await signIn(created.user.email);
  const { error: refused } = await organizer.rpc("decide_approval", {
    target: approvalId,
    p_approve: true,
    p_reason: null,
  });

  check(
    "un organisateur ne peut pas valider l'engagement",
    Boolean(refused),
    refused ? "refus explicite" : "AUCUN REFUS — faille",
  );

  // 7. Le propriétaire, lui, décide — et l'aval retient l'offre.
  const { error: decideError } = await owner.rpc("decide_approval", {
    target: approvalId,
    p_approve: true,
    p_reason: null,
  });
  check("le valideur accorde l'aval", !decideError, decideError?.message ?? "");

  const { data: after } = await owner
    .from("quotes")
    .select("status")
    .eq("id", quote.id)
    .single();
  check("l'aval retient l'offre dans la même transaction", after?.status === "accepted");

  const { data: awarded } = await owner
    .from("quote_request_items")
    .select("awarded_quote_id")
    .eq("id", item.id)
    .single();
  check("le besoin est attribué", awarded?.awarded_quote_id === quote.id);

  // 8. Le budget enregistre l'engagement.
  const { data: usage } = await owner
    .from("company_budget_usage")
    .select("committed, remaining")
    .eq("cost_center_id", costCenterId)
    .single();

  check(
    "le centre de coût enregistre l'engagement",
    Number(usage?.committed) === 2_400_000 && Number(usage?.remaining) === 2_600_000,
    usage ? `engagé ${usage.committed}, restant ${usage.remaining}` : "vue vide",
  );

  // 9. Le partenaire ne voit ni le budget ni les avals de son client.
  const { data: peekedBudget } = await partner.from("company_budget_usage").select("cost_center_id");
  check(
    "le prestataire ne voit pas les budgets de son client",
    (peekedBudget ?? []).every((row) => row.cost_center_id !== costCenterId),
  );

  const { data: peekedApproval } = await partner.from("approvals").select("id").eq("id", approvalId);
  check("le prestataire ne voit pas les avals de son client", (peekedApproval?.length ?? 0) === 0);
} catch (error) {
  console.error("\nErreur :", error.message);
  failures += 1;
} finally {
  if (requestId) await admin.from("quote_requests").delete().eq("id", requestId);
  if (costCenterId) await admin.from("cost_centers").delete().eq("id", costCenterId);
  if (organizerId) {
    await admin.from("organization_members").delete().eq("user_id", organizerId);
    await admin.auth.admin.deleteUser(organizerId);
  }

  // Le seuil de l'entreprise de démonstration est restauré : le contrôle ne
  // doit pas laisser le jeu de démonstration dans un autre état qu'il l'a
  // trouvé.
  if (companyOrgId && previousThreshold !== undefined) {
    await admin
      .from("company_settings")
      .update({ approval_threshold: previousThreshold })
      .eq("org_id", companyOrgId);
  }

  console.log("  données d'essai purgées, seuil restauré");
}

console.log(failures === 0 ? "\nEspace entreprise : tout est vert." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
