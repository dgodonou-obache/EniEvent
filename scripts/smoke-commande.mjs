import { createClient } from "@supabase/supabase-js";

/**
 * Commande et paiement, de bout en bout contre le vrai Supabase et le vrai
 * FedaPay.
 *
 *   npm run smoke:commande
 *
 * Ce que ce contrôle prouve, et qu'aucun test simulé ne prouverait :
 *
 * - accepter un devis **crée une commande**, aux bons montants, par déclencheur ;
 * - `start_payment` **calcule le montant lui-même** et refuse qu'on le lui dicte ;
 * - un autre utilisateur ne peut ni lire ni régler la commande d'autrui ;
 * - le webhook de production **relit la transaction** et ne valide rien sur la
 *   foi de son corps — c'est le point sur lequel repose toute la sécurité du
 *   tunnel, puisque FodaPay n'expose pas son secret de signature.
 *
 * Aucun argent réel : la clé doit être une clé de bac à sable, et le script
 * refuse de tourner autrement.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = process.env.DEMO_PASSWORD;
const FEDAPAY = process.env.FEDAPAY_SECRET_KEY;
const SITE = process.env.SMOKE_SITE_URL ?? "https://enievent.com";

if (!url || !publishable || !secret || !PASSWORD || !FEDAPAY) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

if (!FEDAPAY.startsWith("sk_sandbox")) {
  console.error("FEDAPAY_SECRET_KEY n'est pas une clé de bac à sable — contrôle refusé.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
let failures = 0;

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

const fedapay = async (method, path, body) => {
  const res = await fetch(`https://sandbox-api.fedapay.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${FEDAPAY}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

try {
  const client = await signIn("demo-particulier@enievent.bj");
  const intrus = await signIn("demo-entreprise@enievent.bj");

  // --- 1. Un devis en attente, et l'acceptation qui doit créer la commande ---
  const { data: attente } = await admin
    .from("quotes")
    .select("id, subtotal, currency, org_id, item_id")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  if (!attente) {
    console.log("Aucun devis en attente : lancez npm run demo:devis pour en produire un.");
    process.exit(0);
  }

  const { data: profil } = await admin
    .from("partner_profiles")
    .select("deposit_percent")
    .eq("org_id", attente.org_id)
    .maybeSingle();

  const pct = Number(profil?.deposit_percent ?? 30);
  const acompteAttendu = Math.round((attente.subtotal * pct) / 100);

  const { error: acceptation } = await client.rpc("accept_quote", { target: attente.id });
  check("le client accepte son devis", !acceptation, acceptation?.message ?? "");

  const { data: commande } = await admin
    .from("orders")
    .select("*")
    .eq("quote_id", attente.id)
    .maybeSingle();

  check("une commande est née du déclencheur", Boolean(commande), commande?.reference ?? "absente");
  if (!commande) throw new Error("pas de commande : le reste du contrôle n'a plus de sens");

  check(
    "le total de la commande est celui du devis",
    commande.total === attente.subtotal,
    `${commande.total} vs ${attente.subtotal}`,
  );
  check(
    `l'acompte suit le taux du partenaire (${pct} %)`,
    commande.deposit_amount === acompteAttendu,
    `${commande.deposit_amount} attendu ${acompteAttendu}`,
  );

  // --- 2. Cloisonnement ------------------------------------------------------
  const { data: vueIntrus } = await intrus.from("orders").select("id").eq("id", commande.id);
  check("un autre utilisateur ne voit pas cette commande", (vueIntrus ?? []).length === 0);

  const { error: refus } = await intrus.rpc("start_payment", {
    target: commande.id,
    nature: "deposit",
    cle: `intrusion-${Date.now()}`,
  });
  check("un autre utilisateur ne peut pas la régler", Boolean(refus), refus?.message ?? "");

  // --- 3. Ouverture du paiement ---------------------------------------------
  const cle = `smoke-${Date.now()}`;
  const { data: paiement, error: ouverture } = await client.rpc("start_payment", {
    target: commande.id,
    nature: "deposit",
    cle,
  });

  check("le client ouvre un paiement", !ouverture, ouverture?.message ?? "");
  const ligne = Array.isArray(paiement) ? paiement[0] : paiement;
  if (!ligne) throw new Error("pas de paiement ouvert");

  check(
    "le montant est calculé en base, pas fourni",
    ligne.amount === acompteAttendu,
    `${ligne.amount} attendu ${acompteAttendu}`,
  );
  check(
    "la ventilation retombe exactement sur le montant",
    ligne.commission + ligne.partner_due === ligne.amount,
    `${ligne.commission} + ${ligne.partner_due} = ${ligne.amount}`,
  );

  // --- 4. Transaction réelle chez FedaPay ------------------------------------
  const creation = await fedapay("POST", "/transactions", {
    description: `Contrôle ÉniEvent — ${ligne.reference}`,
    amount: ligne.amount,
    currency: { iso: "XOF" },
    callback_url: `${SITE}/paiement/retour?cle=${encodeURIComponent(cle)}`,
    merchant_reference: ligne.reference,
    custom_metadata: { cle },
    customer: {
      firstname: "Contrôle",
      lastname: "ÉniEvent",
      email: "contact@enievent.com",
    },
  });

  const tx = creation.json?.["v1/transaction"];
  check("FedaPay ouvre la transaction", Boolean(tx?.id), `HTTP ${creation.status}`);
  if (!tx?.id) throw new Error("pas de transaction");

  const { error: rattachement } = await client.rpc("attach_payment_reference", {
    cle,
    ref: String(tx.id),
    adresse: "https://sandbox-process.fedapay.com/controle",
  });
  check("la référence du prestataire est rattachée", !rattachement, rattachement?.message ?? "");

  // --- 5. Le webhook de production -------------------------------------------
  // Corps volontairement mensonger : il annonce un paiement approuvé alors que
  // la transaction est en attente. Si le webhook croyait son corps, la commande
  // passerait à « payée » sans qu'un franc ait été versé.
  const envoi = await fetch(`${SITE}/api/webhooks/fedapay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "transaction.approved", entity: { id: tx.id, status: "approved" } }),
  });

  check("le webhook de production répond", envoi.ok, `HTTP ${envoi.status}`);

  const { data: apres } = await admin.from("payments").select("*").eq("idempotency_key", cle).maybeSingle();

  // Le paiement doit rester **en attente**, et non passer en échec : un webhook
  // arrivé pendant que le client est encore sur la page de l'opérateur ne doit
  // pas tuer un paiement en cours.
  check(
    "il ne croit pas un corps qui annonce « approuvé »",
    apres?.status === "pending",
    `état ${apres?.status} (la transaction est réellement ${tx.status})`,
  );

  const { data: cmdApres } = await admin.from("orders").select("status").eq("id", commande.id).maybeSingle();
  check(
    "la commande n'est pas passée à « payée »",
    cmdApres?.status === "pending_payment",
    `état ${cmdApres?.status}`,
  );
} catch (error) {
  console.error("\nInterrompu :", error.message);
  failures += 1;
}

console.log(failures === 0 ? "\nTout est conforme." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
