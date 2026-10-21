import { createClient } from "@supabase/supabase-js";

/**
 * Annulation, remboursement et retenue, contre le vrai Supabase.
 *
 *   npm run smoke:annulation
 *
 * Ce que ce contrôle prouve, et que les tests sur PGlite ne prouvent pas :
 *
 * - `cancel_order` est **appelable par PostgREST**, et son type composite
 *   revient bien sous une forme exploitable — un type de retour qui se
 *   sérialise mal compile parfaitement et casse à l'exécution ;
 * - les `grant` posés par la migration tiennent sur le vrai projet, où les
 *   rôles ne sont pas ceux du banc d'essai ;
 * - **un encaissement n'est pas versable avant la prestation**, ce qui est la
 *   garantie centrale du lot : sans elle, on rembourse un client avec de
 *   l'argent déjà parti chez le partenaire.
 *
 * Le script nettoie derrière lui : la réservation créée est annulée, et sa
 * date rendue au catalogue.
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

/** Un jour lointain, propre à cette exécution : deux essais ne se gênent pas. */
function jourDEssai() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 200 + Math.floor(Math.random() * 120));
  return d.toISOString().slice(0, 10);
}

/**
 * Efface la réservation d'essai et tout ce qu'elle a produit.
 *
 * **Un remboursement d'essai laissé en base n'est pas anodin** : il s'affiche
 * dans `/admin/remboursements` comme une somme réellement due à un client, et
 * rien ne le distingue d'un vrai. Les clés étrangères sont en `restrict` : il
 * faut donc défaire dans l'ordre inverse de la construction.
 */
async function menage(commandeId, annonceId, jour) {
  const { data: paiements } = await admin
    .from("payments")
    .select("id")
    .eq("order_id", commandeId);

  const ids = (paiements ?? []).map((p) => p.id);
  if (ids.length > 0) await admin.from("refund_lines").delete().in("payment_id", ids);

  // ⚠️ **Les notifications d'abord, et par l'identifiant du _paiement_.**
  // Depuis la migration 0053, encaisser met deux lignes en file — client et
  // partenaire — et la base sonne `/api/cron/notifications` par `pg_net` dès
  // l'écriture. Sans cette suppression, chaque exécution enverrait de vrais
  // courriels à des adresses de démonstration qui n'existent pas, et chaque
  // rebond abîme un peu la réputation d'expéditeur du domaine. Même régime que
  // `smoke:avis` : la course est serrée, la suppression gagne en pratique.
  if (ids.length > 0) await admin.from("notifications").delete().in("ref_id", ids);
  await admin.from("notifications").delete().eq("ref_id", commandeId);

  await admin.from("refunds").delete().eq("order_id", commandeId);
  await admin.from("payments").delete().eq("order_id", commandeId);
  await admin.from("order_instalments").delete().eq("order_id", commandeId);
  await admin.from("orders").delete().eq("id", commandeId);
  await admin.from("availabilities").delete().eq("listing_id", annonceId).eq("date", jour);
}

let commande = null;
/** Annonce dont ce script a ouvert le tunnel immédiat, et le mode à lui rendre. */
let ouverte = null;

/**
 * Remet l'annonce sur devis.
 *
 * ⚠️ **Appelée dans tous les cas, y compris sur échec.** Une annonce fictive
 * laissée réservable est précisément le défaut que la migration 0051 a
 * refermé : un inconnu pourrait régler une villa qui n'existe pas.
 */
async function refermer() {
  if (!ouverte) return;

  await admin
    .from("listings")
    .update({ booking_mode: ouverte.mode })
    .eq("id", ouverte.id);

  const { data } = await admin
    .from("listings")
    .select("booking_mode")
    .eq("id", ouverte.id)
    .single();

  check(
    "l'annonce est rendue à son tunnel sur devis",
    data?.booking_mode === "quote",
    data?.booking_mode ?? "ILLISIBLE",
  );
}

try {
  const client = await signIn("demo-particulier@enievent.bj");
  const intrus = await signIn("demo-entreprise@enievent.bj");

  // --- 1. Une annonce réservable, que ce script ouvre lui-même --------------
  //
  // ⚠️ **Le jeu de démonstration n'en contient plus aucune** (migration 0051) :
  // ses annonces sont fictives, et les laisser payables permettait à un inconnu
  // de régler jusqu'à 450 000 F pour une villa inventée. Ce contrôle a besoin
  // du tunnel immédiat, il l'ouvre donc lui-même, sur une seule annonce, et le
  // referme en partant — plutôt que de dépendre d'un état du seed que personne
  // n'a plus le droit de poser.
  const { data: annonce } = await admin
    .from("listings")
    .select("id, title, org_id, cancellation_policy_id, booking_mode")
    .eq("status", "approved")
    .eq("is_paused", false)
    .not("cancellation_policy_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!annonce) {
    console.log("Aucune annonce publiée : lancez npm run demo:reset.");
    process.exit(0);
  }

  if (annonce.booking_mode === "quote") {
    ouverte = { id: annonce.id, mode: annonce.booking_mode };
    const { error } = await admin
      .from("listings")
      .update({ booking_mode: "both" })
      .eq("id", annonce.id);

    check("le tunnel immédiat est ouvert pour la durée du contrôle", !error, annonce.title);
  }

  check(
    "l'annonce porte un barème d'annulation",
    Boolean(annonce.cancellation_policy_id),
    annonce.title,
  );

  const jour = jourDEssai();

  await admin
    .from("availabilities")
    .upsert(
      { listing_id: annonce.id, date: jour, slot: "journee", price: 300000, inventory: 1 },
      { onConflict: "listing_id,date,slot" },
    );

  // --- 2. Réserver ----------------------------------------------------------
  const { data: reservation, error: erreurReservation } = await client.rpc("book_listing", {
    annonce: annonce.id,
    jours: [jour],
  });

  check("le client réserve", !erreurReservation, erreurReservation?.message ?? "");
  commande = Array.isArray(reservation) ? reservation[0] : reservation;
  if (!commande) throw new Error("pas de commande : le reste du contrôle n'a plus de sens");

  check(
    "le barème est figé sur la commande",
    commande.cancellation_policy_id === annonce.cancellation_policy_id,
    commande.reference,
  );

  // --- 3. Régler la première échéance ---------------------------------------
  const { data: echeance } = await admin
    .from("order_instalments")
    .select("id, amount")
    .eq("order_id", commande.id)
    .order("position")
    .limit(1)
    .maybeSingle();

  const cle = `essai-annulation-${commande.id}`;
  await client.rpc("start_payment", { echeance: echeance.id, cle });

  // Dénoué avec la clé de service, comme le ferait le webhook après relecture.
  await admin.rpc("settle_payment", {
    cle,
    ref_prestataire: `essai-${Date.now()}`,
    etat_prestataire: "approved",
    encaisse: true,
  });

  const { data: regle } = await admin
    .from("payments")
    .select("amount, partner_due, status")
    .eq("idempotency_key", cle)
    .maybeSingle();

  check("l'échéance est encaissée", regle?.status === "paid", `${regle?.amount}`);

  // --- 4. La retenue --------------------------------------------------------
  const admins = await signIn("demo-admin@enievent.bj");
  const { data: file } = await admins.rpc("payout_candidates");
  const ligne = (file ?? []).find((l) => l.org_id === annonce.org_id);

  // Le contrôle qui porte tout le lot : la prestation n'a pas eu lieu, donc
  // rien ne part. L'argent est visible, mais retenu.
  check(
    "l'encaissement est retenu jusqu'à la prestation",
    ligne === undefined || Number(ligne.held) >= Number(regle.partner_due),
    ligne ? `${ligne.payable} versable, ${ligne.held} retenu` : "aucune ligne",
  );

  // --- 5. Un tiers ne peut pas annuler --------------------------------------
  const { error: refus } = await intrus.rpc("cancel_order", { cible: commande.id });
  check(
    "un tiers ne peut pas annuler la réservation d'autrui",
    Boolean(refus),
    refus?.message ?? "AUCUNE ERREUR — la fonction a accepté",
  );

  // --- 6. Annuler -----------------------------------------------------------
  const { data: issue, error: erreurAnnulation } = await client.rpc("cancel_order", {
    cible: commande.id,
    motif: "Contrôle automatique",
  });

  check("le client annule sa réservation", !erreurAnnulation, erreurAnnulation?.message ?? "");

  const sortie = Array.isArray(issue) ? issue[0] : issue;

  check(
    "le type composite revient exploitable par PostgREST",
    sortie !== null && typeof sortie === "object" && "refunded" in sortie,
    JSON.stringify(sortie),
  );

  check(
    "le remboursement retombe exactement sur ce qui a été encaissé",
    Number(sortie.retained) + Number(sortie.refunded) === Number(sortie.paid),
    `${sortie.retained} + ${sortie.refunded} = ${sortie.paid}`,
  );

  // --- 7. Le remboursement est inscrit, et visible du bon monde -------------
  const { data: vuParLeClient } = await client
    .from("refunds")
    .select("reference, amount, status")
    .eq("order_id", commande.id)
    .maybeSingle();

  if (Number(sortie.refunded) > 0) {
    check(
      "le client voit son remboursement",
      vuParLeClient?.status === "pending",
      vuParLeClient?.reference ?? "invisible",
    );

    const { data: vuParLIntrus } = await intrus
      .from("refunds")
      .select("id")
      .eq("order_id", commande.id)
      .maybeSingle();

    // Une lecture bloquée par une clause `using` ne lève aucune erreur : elle
    // rend zéro ligne. C'est donc l'absence qu'on vérifie.
    check("un tiers ne voit pas ce remboursement", !vuParLIntrus, vuParLIntrus?.id ?? "");
  } else {
    check("aucun remboursement dû, aucun inscrit", !vuParLeClient, sortie.refund_percent + " %");
  }

  // --- 8. La date est rendue ------------------------------------------------
  const { data: dispo } = await admin
    .from("availabilities")
    .select("capacity_used, status")
    .eq("listing_id", annonce.id)
    .eq("date", jour)
    .maybeSingle();

  check(
    "la date repart au catalogue",
    dispo?.capacity_used === 0 && dispo?.status === "open",
    `${dispo?.capacity_used} pris, état ${dispo?.status}`,
  );

  await menage(commande.id, annonce.id, jour);
} catch (error) {
  console.error("\nInterrompu :", error.message);
  failures += 1;
} finally {
  // ⚠️ Dans un `finally` : une interruption au milieu du parcours ne doit pas
  // laisser une annonce fictive payable derrière elle.
  await refermer();
}

console.log(failures === 0 ? "\nTout est conforme." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
