import { createClient } from "@supabase/supabase-js";

/**
 * Le parcours d'un avis, de bout en bout, contre le vrai Supabase.
 *
 *   npm run smoke:avis
 *
 * Ce que ce contrôle prouve, et que les tests sur PGlite ne prouvent pas :
 *
 * - ⚠️ **les droits de colonne tiennent sur le vrai projet.** PGlite ne
 *   reproduit pas les `alter default privileges` de Supabase (§3 du guide) :
 *   un test local « cette colonne n'est pas écrivable » passe sans rien
 *   prouver. Ici, `reviews` n'accepte que trois colonnes à l'écriture, et
 *   `hidden_reason` n'est lisible par personne — administration comprise.
 * - **les fonctions sont appelables par PostgREST** : `reply_to_review`,
 *   `open_report`, `resolve_report`, `open_dispute`, `admin_reviews`. Une
 *   signature qui se sérialise mal compile parfaitement et casse à l'exécution.
 * - **le retrait sur signalement opère réellement**, et la note du partenaire
 *   baisse dans la seconde — c'est un déclencheur, pas du code applicatif.
 *
 * ⚠️ **Ce script écrit sur une annonce réelle**, le temps de son exécution :
 * une commande, un paiement encaissé, un avis, un signalement, un litige. Tout
 * est défait à la fin, y compris en cas d'échec. Même régime que
 * `smoke:annulation`, qui réserve et rembourse pour de vrai.
 *
 * ⚠️ **Les notifications mises en file sont supprimées aussitôt vérifiées.** La
 * base sonne `/api/cron/notifications` par `pg_net` dès l'écriture : sans cette
 * suppression, chaque exécution enverrait de vrais courriels à des adresses de
 * démonstration qui n'existent pas, et chaque rebond abîme un peu la
 * réputation d'expéditeur du domaine. La course est serrée mais la suppression
 * gagne en pratique ; si une notification part malgré tout, elle est
 * inoffensive.
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
let echecs = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "  OK  " : " ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

async function signIn(email) {
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`connexion ${email} : ${error.message} — lancez npm run demo:reset`);
  return client;
}

/** Un jour **passé** : c'est la seule notion de « prestation réalisée » qui existe. */
function jourPasse() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

let commande = null;
let annonce = null;

/**
 * Défait tout, dans l'ordre inverse de la construction.
 *
 * Les clés étrangères des paiements sont en `restrict` : il faut partir des
 * feuilles. `reviews` et `disputes` cascadent sur la commande, mais on les
 * efface explicitement pour que le recalcul des notes se déclenche **avant**
 * la disparition de l'annonce de référence.
 */
async function menage() {
  if (!commande) return;

  const { data: avis } = await admin.from("reviews").select("id").eq("order_id", commande.id);
  for (const a of avis ?? []) {
    // ⚠️ **La notification d'un signalement porte l'identifiant du
    // signalement**, pas celui de l'avis : la première version de ce ménage
    // laissait donc une ligne `report.new` derrière elle à chaque exécution.
    // Les identifiants se relèvent **avant** la suppression des signalements.
    const { data: signalements } = await admin
      .from("reports")
      .select("id")
      .eq("review_id", a.id);

    for (const s of signalements ?? []) {
      await admin.from("notifications").delete().eq("ref_id", s.id);
    }

    await admin.from("reports").delete().eq("review_id", a.id);
    await admin.from("notifications").delete().eq("ref_id", a.id);
  }
  await admin.from("reviews").delete().eq("order_id", commande.id);

  const { data: litiges } = await admin.from("disputes").select("id").eq("order_id", commande.id);
  for (const l of litiges ?? []) await admin.from("notifications").delete().eq("ref_id", l.id);
  await admin.from("disputes").delete().eq("order_id", commande.id);

  await admin.from("payments").delete().eq("order_id", commande.id);
  await admin.from("order_instalments").delete().eq("order_id", commande.id);
  await admin.from("notifications").delete().eq("ref_id", commande.id);
  await admin.from("orders").delete().eq("id", commande.id);
}

try {
  const client = await signIn("demo-particulier@enievent.bj");
  const partenaire = await signIn("demo-partenaire@enievent.bj");
  const administration = await signIn("demo-admin@enievent.bj");
  const intrus = await signIn("demo-entreprise@enievent.bj");

  const { data: moi } = await client.auth.getUser();
  const clientId = moi.user.id;

  // --- 1. Une annonce du partenaire de démonstration ------------------------
  //
  // Celle du partenaire connecté, pour qu'il puisse réellement répondre et
  // signaler : ces deux gestes vérifient son rôle dans l'organisation.
  const { data: membre } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", (await partenaire.auth.getUser()).data.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membre) {
    console.log("Le partenaire de démonstration n'a pas d'organisation : npm run demo:reset.");
    process.exit(0);
  }

  const { data: trouvee } = await admin
    .from("listings")
    .select("id, title, org_id, cancellation_policy_id, rating_avg, rating_count")
    .eq("org_id", membre.org_id)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  annonce = trouvee;

  if (!annonce) {
    console.log("Aucune annonce publiée chez ce partenaire : npm run demo:reset.");
    process.exit(0);
  }

  check("une annonce publiée sert de support", true, annonce.title);
  check(
    "elle part d'une note vierge",
    annonce.rating_count === 0,
    `${annonce.rating_count} avis déjà`,
  );

  // --- 2. Une prestation réalisée et réglée ---------------------------------
  //
  // Écrite avec la clé de service : c'est par là que passent le webhook et la
  // tâche planifiée, et une commande ne naît jamais d'un appel client (§2 du
  // guide). Ce que ce script éprouve est l'avis, pas la réservation — celle-ci
  // l'est par `smoke:annulation` et `smoke:commande`.
  const jour = jourPasse();

  const { data: creee, error: erreurCommande } = await admin
    .from("orders")
    .insert({
      org_id: annonce.org_id,
      client_id: clientId,
      listing_id: annonce.id,
      listing_title: annonce.title,
      total: 300000,
      commission_rate: 10,
      status: "paid",
      event_date: jour,
      start_date: jour,
      end_date: jour,
      cancellation_policy_id: annonce.cancellation_policy_id,
    })
    .select("id, reference")
    .single();

  if (erreurCommande) throw new Error(`commande d'essai : ${erreurCommande.message}`);
  commande = creee;

  const { data: echeance } = await admin
    .from("order_instalments")
    .insert({ order_id: commande.id, position: 0, label: "Solde", amount: 300000, due_date: jour })
    .select("id")
    .single();

  await admin.from("payments").insert({
    order_id: commande.id,
    instalment_id: echeance.id,
    amount: 300000,
    commission: 30000,
    partner_due: 270000,
    idempotency_key: `essai-avis-${commande.id}`,
    status: "paid",
    paid_at: new Date().toISOString(),
  });

  check("la prestation est réglée et passée", true, `${commande.reference} du ${jour}`);

  // --- 3. Le dépôt de l'avis ------------------------------------------------
  const { data: depose, error: erreurDepot } = await client
    .from("reviews")
    .insert({ order_id: commande.id, rating: 4, body: "Contrôle automatique — avis d'essai." })
    .select("id, author_label, org_id, listing_id")
    .single();

  check("le client dépose son avis", !erreurDepot, erreurDepot?.message ?? "");
  if (!depose) throw new Error("pas d'avis : le reste du contrôle n'a plus de sens");

  check(
    "l'organisation et l'annonce sont dérivées en base",
    depose.org_id === annonce.org_id && depose.listing_id === annonce.id,
    `${depose.org_id === annonce.org_id ? "org ok" : "ORG FAUSSE"}`,
  );
  check(
    "la signature est réduite au prénom et à l'initiale",
    /^[^ ]+( [A-ZÉÈÀÇ]\.)?$/.test(depose.author_label) || depose.author_label === "Un client",
    depose.author_label,
  );

  // --- 4. Ce que le formulaire ne peut pas envoyer --------------------------
  //
  // ⚠️ Le contrôle que PGlite ne peut pas faire. `grant insert (order_id,
  // rating, body)` : nommer une autre colonne doit lever un refus de droit,
  // pas être silencieusement ignoré.
  const { error: refusColonne } = await client
    .from("reviews")
    .insert({ order_id: commande.id, rating: 1, org_id: annonce.org_id });

  check(
    "nommer l'organisation notée est refusé",
    Boolean(refusColonne),
    refusColonne?.message?.slice(0, 60) ?? "AUCUNE ERREUR — la colonne est écrivable",
  );

  const { error: refusTiers } = await intrus
    .from("reviews")
    .insert({ order_id: commande.id, rating: 1 });

  check(
    "un tiers ne peut pas noter la réservation d'autrui",
    Boolean(refusTiers),
    refusTiers?.message?.slice(0, 60) ?? "AUCUNE ERREUR",
  );

  // --- 5. Les notes recalculées --------------------------------------------
  const lireNotes = async () =>
    (
      await admin
        .from("listings")
        .select("rating_avg, rating_count")
        .eq("id", annonce.id)
        .single()
    ).data;

  const apresDepot = await lireNotes();
  check(
    "la note de l'annonce est recalculée par déclencheur",
    Number(apresDepot.rating_avg) === 4 && apresDepot.rating_count === 1,
    `${apresDepot.rating_avg} sur ${apresDepot.rating_count} avis`,
  );

  const { data: profil } = await admin
    .from("partner_profiles")
    .select("rating_avg, rating_count")
    .eq("org_id", annonce.org_id)
    .single();

  check(
    "celle du partenaire aussi",
    Number(profil.rating_avg) === 4 && profil.rating_count >= 1,
    `${profil.rating_avg} sur ${profil.rating_count}`,
  );

  // Le seuil de classement : une note sous trois avis ne pèse pas.
  const { data: vue } = await admin
    .from("listing_search")
    .select("rating_avg, rating_sort")
    .eq("id", annonce.id)
    .single();

  check(
    "un seul avis ne pèse pas sur le classement",
    vue.rating_sort === null && Number(vue.rating_avg) === 4,
    `affichée ${vue.rating_avg}, classement ${vue.rating_sort ?? "aucun"}`,
  );

  // --- 6. Le droit de réponse ----------------------------------------------
  const { error: refusReponseTiers } = await intrus.rpc("reply_to_review", {
    avis: depose.id,
    texte: "Réponse d'un prestataire qui n'est pas concerné.",
  });

  check(
    "un concurrent ne peut pas répondre",
    Boolean(refusReponseTiers),
    refusReponseTiers?.message?.slice(0, 60) ?? "AUCUNE ERREUR",
  );

  const { error: erreurReponse } = await partenaire.rpc("reply_to_review", {
    avis: depose.id,
    texte: "Contrôle automatique — réponse d'essai du prestataire.",
  });

  check("le prestataire répond", !erreurReponse, erreurReponse?.message ?? "");

  const { error: refusSeconde } = await partenaire.rpc("reply_to_review", {
    avis: depose.id,
    texte: "Et une seconde réponse, qui doit être refusée.",
  });

  check("une seule réponse par avis", Boolean(refusSeconde), refusSeconde?.message ?? "");

  const { error: refusReecriture } = await client
    .from("reviews")
    .update({ rating: 1 })
    .eq("id", depose.id);

  const { data: inchange } = await admin
    .from("reviews")
    .select("rating")
    .eq("id", depose.id)
    .single();

  check(
    "l'auteur ne réécrit plus son avis après la réponse",
    inchange.rating === 4,
    refusReecriture ? refusReecriture.message.slice(0, 50) : `note = ${inchange.rating}`,
  );

  // --- 7. Le motif de modération, hors de toute lecture directe ------------
  const { error: refusMotif } = await administration
    .from("reviews")
    .select("hidden_reason")
    .eq("id", depose.id);

  check(
    "hidden_reason est refusée même à l'administration",
    Boolean(refusMotif),
    refusMotif?.message?.slice(0, 60) ?? "AUCUNE ERREUR — la colonne est lisible",
  );

  const { data: parFonction, error: erreurFonction } = await administration.rpc("admin_reviews", {
    etat: "tous",
  });

  check(
    "admin_reviews() la rend à l'administration",
    !erreurFonction && (parFonction ?? []).some((a) => a.id === depose.id),
    erreurFonction?.message ?? `${(parFonction ?? []).length} avis lus`,
  );

  const { data: refusee } = await client.rpc("admin_reviews", { etat: "tous" });
  check("et à personne d'autre", (refusee ?? []).length === 0, `${(refusee ?? []).length} lignes`);

  // --- 8. Le retrait sur signalement ---------------------------------------
  const { data: reference, error: erreurSignalement } = await partenaire.rpc("open_report", {
    genre: "review",
    cible: depose.id,
    motif: "Contrôle automatique — signalement d'essai du prestataire concerné.",
  });

  check("le prestataire signale l'avis", !erreurSignalement, reference ?? erreurSignalement?.message);

  const { data: masque } = await admin
    .from("reviews")
    .select("hidden_at")
    .eq("id", depose.id)
    .single();

  check(
    "l'avis est retiré sur-le-champ",
    masque.hidden_at !== null,
    masque.hidden_at ?? "TOUJOURS VISIBLE",
  );

  const apresRetrait = await lireNotes();
  check(
    "et il sort aussitôt de la note",
    apresRetrait.rating_count === 0 && apresRetrait.rating_avg === null,
    `${apresRetrait.rating_avg ?? "aucune"} sur ${apresRetrait.rating_count} avis`,
  );

  // --- 9. L'examen, et l'immunité ------------------------------------------
  const { data: signalement } = await admin
    .from("reports")
    .select("id")
    .eq("review_id", depose.id)
    .limit(1)
    .maybeSingle();

  const { error: refusArbitrage } = await partenaire.rpc("resolve_report", {
    signalement: signalement.id,
    issue: "dismissed",
    note: "Je tranche mon propre signalement, ce qui doit être refusé.",
  });

  check(
    "le signaleur ne tranche pas son propre signalement",
    Boolean(refusArbitrage),
    refusArbitrage?.message?.slice(0, 60) ?? "AUCUNE ERREUR",
  );

  const { error: erreurArbitrage } = await administration.rpc("resolve_report", {
    signalement: signalement.id,
    issue: "dismissed",
    note: "Contrôle automatique — avis légitime, rétabli et désormais immunisé.",
  });

  check("l'administration écarte le signalement", !erreurArbitrage, erreurArbitrage?.message ?? "");

  const { data: retabli } = await admin
    .from("reviews")
    .select("hidden_at, reinstated_at")
    .eq("id", depose.id)
    .single();

  check(
    "l'avis est rétabli et marqué immunisé",
    retabli.hidden_at === null && retabli.reinstated_at !== null,
    retabli.reinstated_at ?? "PAS D'IMMUNITÉ",
  );

  // --- 10. Le litige -------------------------------------------------------
  const { error: refusLitigeTiers } = await intrus.rpc("open_dispute", {
    commande: commande.id,
    motif: "Je conteste une réservation qui ne me concerne absolument pas du tout.",
  });

  check(
    "un tiers ne peut pas ouvrir de litige",
    Boolean(refusLitigeTiers),
    refusLitigeTiers?.message?.slice(0, 60) ?? "AUCUNE ERREUR",
  );

  const { data: refLitige, error: erreurLitige } = await client.rpc("open_dispute", {
    commande: commande.id,
    motif: "Contrôle automatique — litige d'essai, ouvert par le client sur une prestation réglée.",
  });

  check("le client ouvre un litige", !erreurLitige, refLitige ?? erreurLitige?.message);

  const { data: litige } = await admin
    .from("disputes")
    .select("id, side, status")
    .eq("order_id", commande.id)
    .limit(1)
    .maybeSingle();

  check("il est rangé du côté du client", litige?.side === "client", litige?.status ?? "");

  // Les deux parties le voient ; un concurrent non.
  const vuPar = async (c) =>
    ((await c.from("disputes").select("id").eq("order_id", commande.id)).data ?? []).length;

  check("le prestataire mis en cause le voit", (await vuPar(partenaire)) === 1);
  check("un concurrent ne le voit pas", (await vuPar(intrus)) === 0);

  // ⚠️ Supprimées aussitôt vérifiées : sans cela, chaque exécution enverrait
  // de vrais courriels à des adresses de démonstration qui n'existent pas.
  const { data: prevenus } = await admin
    .from("notifications")
    .select("recipient, kind")
    .eq("ref_id", litige.id);

  check(
    "l'autre partie et l'équipe sont prévenues",
    (prevenus ?? []).length >= 1,
    (prevenus ?? []).map((n) => n.recipient).join(", ") || "personne",
  );

  await admin.from("notifications").delete().eq("ref_id", litige.id);
  await admin.from("notifications").delete().eq("ref_id", depose.id);

  const { error: refusTrancheClient } = await client.rpc("resolve_dispute", {
    litige: litige.id,
    issue: "resolved_refund",
    note: "Je tranche en ma propre faveur, ce qui doit être refusé net.",
  });

  check(
    "le client ne tranche pas son propre litige",
    Boolean(refusTrancheClient),
    refusTrancheClient?.message?.slice(0, 60) ?? "AUCUNE ERREUR",
  );

  const { error: erreurTranche } = await administration.rpc("resolve_dispute", {
    litige: litige.id,
    issue: "resolved_partner",
    note: "Contrôle automatique — décision d'essai, en faveur du prestataire.",
  });

  check("l'administration tranche", !erreurTranche, erreurTranche?.message ?? "");

  const { data: clos } = await admin
    .from("disputes")
    .select("status, resolved_at")
    .eq("id", litige.id)
    .single();

  check(
    "le litige est clos et daté",
    clos.status === "resolved_partner" && clos.resolved_at !== null,
    clos.status,
  );
} catch (error) {
  console.error(`\nInterrompu : ${error.message}`);
  echecs += 1;
} finally {
  await menage();

  // La note doit être revenue à zéro : un avis d'essai laissé en base
  // afficherait une note sur une annonce réelle, et c'est précisément la
  // preuve sociale fabriquée que le §5 du guide interdit.
  if (annonce) {
    const { data: final } = await admin
      .from("listings")
      .select("rating_avg, rating_count")
      .eq("id", annonce.id)
      .single();

    check(
      "le ménage rend l'annonce à sa note vierge",
      final.rating_count === 0 && final.rating_avg === null,
      `${final.rating_avg ?? "aucune"} sur ${final.rating_count} avis`,
    );
  }
}

console.log("");
if (echecs > 0) {
  console.error(`${echecs} échec(s).`);
  process.exit(1);
}
console.log("Le parcours d'un avis tient de bout en bout.");
