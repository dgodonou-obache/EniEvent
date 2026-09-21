import { createClient } from "@supabase/supabase-js";

/**
 * Messagerie, de bout en bout contre le vrai Supabase.
 *
 *   npm run smoke:messagerie
 *
 * Ce que ce contrôle prouve, et que les tests sur PGlite ne prouvent pas :
 *
 * - les fonctions sont **appelables par PostgREST**, et leurs types composites
 *   reviennent exploitables — un type de retour qui se sérialise mal compile
 *   parfaitement et casse à l'exécution ;
 * - les `grant` posés par la migration tiennent sur le vrai projet, où les
 *   rôles ne sont pas ceux du banc d'essai ;
 * - **`messages` reste inaccessible en lecture directe**, ce qui est toute la
 *   garantie du masquage : une table lisible le contournerait en une requête.
 *
 * Le script nettoie derrière lui : conversation, messages et notifications
 * d'essai sont supprimés.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!url || !publishable || !secret || !PASSWORD) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
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

const NUMERO = "01 97 00 55 44";
const ADRESSE = "essai.messagerie@exemple.bj";

let conversation = null;

try {
  const client = await signIn("demo-particulier@enievent.bj");
  const partenaire = await signIn("demo-partenaire@enievent.bj");
  const intrus = await signIn("demo-entreprise@enievent.bj");

  // --- 1. L'organisation du partenaire de démonstration ---------------------
  const { data: moi } = await partenaire.auth.getUser();
  const { data: appartenance } = await admin
    .from("organization_members")
    .select("org_id, organizations(type)")
    .eq("user_id", moi.user.id)
    .limit(5);

  const orgPartenaire = (appartenance ?? []).find((m) => m.organizations?.type === "partner")?.org_id;

  if (!orgPartenaire) {
    console.log("Le compte partenaire de démonstration n'a pas d'organisation : npm run demo:reset.");
    process.exit(0);
  }

  // --- 2. Ouvrir un fil -----------------------------------------------------
  const { data: fil, error: erreurOuverture } = await client.rpc("open_conversation", {
    org: orgPartenaire,
  });

  check("le client ouvre un fil", !erreurOuverture, erreurOuverture?.message ?? "");
  conversation = Array.isArray(fil) ? fil[0] : fil;
  if (!conversation) throw new Error("pas de conversation : le reste n'a plus de sens");

  const { data: encore } = await client.rpc("open_conversation", { org: orgPartenaire });
  const memeFil = Array.isArray(encore) ? encore[0] : encore;
  check(
    "un second appel retrouve le même fil",
    memeFil?.id === conversation.id,
    conversation.reference,
  );

  // --- 3. Écrire des deux côtés --------------------------------------------
  const { error: e1 } = await client.rpc("send_message", {
    conversation: conversation.id,
    corps: `Bonjour, joignable au ${NUMERO} ou a ${ADRESSE}. Budget 150 000 FCFA.`,
  });
  check("le client écrit", !e1, e1?.message ?? "");

  const { error: e2 } = await partenaire.rpc("send_message", {
    conversation: conversation.id,
    corps: "Bonjour, c'est possible. Je vous confirme demain.",
  });
  check("le prestataire répond", !e2, e2?.message ?? "");

  // --- 4. Le masquage -------------------------------------------------------
  const { data: luParLePartenaire } = await partenaire.rpc("read_conversation", {
    conversation: conversation.id,
  });

  const texte = (luParLePartenaire ?? []).map((m) => m.body).join("\n");

  check("le numéro est masqué", !texte.includes(NUMERO), texte.includes(NUMERO) ? "FUITE" : "");
  check("l'adresse est masquée", !texte.includes(ADRESSE), texte.includes(ADRESSE) ? "FUITE" : "");
  check("le masque est visible", texte.includes("[numéro masqué]"), "");

  // Le faux positif qui rendrait la messagerie inutilisable.
  check("le budget passe intact", texte.includes("150 000 FCFA"), "");

  // --- 5. La table reste close ---------------------------------------------
  //
  // ⚠️ **Ce contrôle ne peut se faire qu'ici.** PGlite ne reproduit pas le
  // `alter default privileges` de Supabase, qui accorde tout à `anon` et
  // `authenticated` sur chaque table neuve : un test « la table n'est pas
  // lisible » y passe sans rien prouver. C'est la migration 0038 qui a retiré
  // ces droits, après les avoir constatés en ligne.
  const { data: fuite, error: refus } = await client.from("messages").select("body").limit(1);
  check(
    "le corps brut n'est pas lisible directement",
    Boolean(refus) || (fuite ?? []).length === 0,
    refus ? refus.message.slice(0, 50) : "LE MASQUAGE EST CONTOURNABLE",
  );

  // --- 6. Le cloisonnement --------------------------------------------------
  const { error: refusTiers } = await intrus.rpc("read_conversation", {
    conversation: conversation.id,
  });
  check(
    "un tiers ne lit pas ce fil",
    Boolean(refusTiers),
    refusTiers?.message ?? "AUCUNE ERREUR — LE FIL EST OUVERT À TOUS",
  );

  const { data: vuParTiers } = await intrus
    .from("conversations")
    .select("id")
    .eq("id", conversation.id)
    .maybeSingle();
  check("ni ne le voit dans la liste", !vuParTiers, vuParTiers?.id ?? "");

  // --- 7. L'anonymat --------------------------------------------------------
  //
  // ⚠️ L'invariant n'est pas « le nom est caché », c'est « le nom suit le
  // seuil ». Les comptes de démonstration ont un historique : le client a déjà
  // commandé chez ce partenaire, il est donc normal qu'il soit nommé. Écrire
  // l'assertion en dur ferait échouer ce contrôle pour une bonne raison, ce
  // qui est la meilleure façon de le voir désactivé.
  const { data: commandes } = await admin
    .from("orders")
    .select("id, status")
    .eq("org_id", orgPartenaire)
    .neq("status", "cancelled")
    .limit(1);

  const dejaEngages = (commandes ?? []).length > 0;

  const { data: listePartenaire } = await partenaire.rpc("my_conversations");
  const vue = (listePartenaire ?? []).find((c) => c.id === conversation.id);

  check(
    dejaEngages
      ? "le prestataire voit le nom du client, une commande existant déjà"
      : "le prestataire ne voit pas le nom du client avant commande",
    dejaEngages ? vue?.counterpart !== "Le client" : vue?.counterpart === "Le client",
    `${vue?.counterpart ?? "absent"} (engagement : ${dejaEngages ? "commande" : "aucun"})`,
  );

  // --- 8. La notification ---------------------------------------------------
  const { data: posees } = await admin
    .from("notifications")
    .select("kind, payload")
    .eq("kind", "message.new")
    .order("created_at", { ascending: false })
    .limit(4);

  const charge = posees?.[0]?.payload ?? {};
  check(
    "la notification ne porte aucun extrait du message",
    !JSON.stringify(charge).includes("150 000") && !JSON.stringify(charge).includes(NUMERO),
    Object.keys(charge).sort().join(", "),
  );

  await menage(conversation.id);
} catch (error) {
  console.error("\nInterrompu :", error.message);
  failures += 1;
  if (conversation) await menage(conversation.id).catch(() => {});
}

async function menage(id) {
  const { data: msgs } = await admin.from("messages").select("id").eq("conversation_id", id);
  await admin
    .from("notifications")
    .delete()
    .in("ref_id", (msgs ?? []).map((m) => m.id));
  await admin.from("conversations").delete().eq("id", id);
}

console.log(failures === 0 ? "\nTout est conforme." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
