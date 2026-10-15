"use server";

import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth/session";
import { money, type CurrencyCode } from "@/lib/money";
import { paymentProvider } from "@/lib/payments/fedapay";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/utils/supabase/server";

/**
 * Réservation immédiate.
 *
 * Le bouton « Réserver » de la fiche annonce n'était relié à rien : il se
 * désactivait tant qu'aucune date n'était choisie — ce qui le faisait paraître
 * vivant — puis ne faisait rien une fois activé. Cette action est ce qui
 * manquait.
 *
 * **Le montant n'est jamais transmis.** Le formulaire n'envoie que l'annonce et
 * les dates ; `book_listing` recalcule le prix depuis le planning du
 * prestataire, et `start_payment` déduit l'échéance de la commande ainsi créée.
 * L'estimation affichée dans l'encart est un confort d'affichage, pas un
 * engagement.
 *
 * Réserver et payer sont enchaînés : c'est ce qu'attend quelqu'un qui clique
 * « Réserver », et les dates sont retenues dès la commande. Un paiement
 * abandonné les rend au bout d'une demi-heure (`release_stale_orders`).
 */

export interface BookingState {
  message?: string;
  /** Adresse de la page du prestataire, à ouvrir côté client. */
  url?: string;
  ok?: boolean;
}

export async function bookAndPay(
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const user = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const brut = String(formData.get("dates") ?? "");
  const dates = brut.split(",").map((d) => d.trim()).filter(Boolean);

  if (!listingId || dates.length === 0) {
    return { message: "Choisissez au moins une date avant de réserver." };
  }

  if (!dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return { message: "Dates illisibles. Resélectionnez-les." };
  }

  const supabase = await createClient();

  const { data: commande, error } = await supabase.rpc("book_listing", {
    annonce: listingId,
    jours: dates,
  });

  if (error || !commande) {
    return { message: translate(error?.message ?? "Réservation impossible.") };
  }

  const ordre = Array.isArray(commande) ? commande[0] : commande;

  // La première échéance : `build_instalments` l'a posée en même temps que la
  // commande, et `start_payment` refuserait d'en régler une autre avant elle.
  const { data: echeance } = await supabase
    .from("order_instalments")
    .select("id, label")
    .eq("order_id", ordre.id)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (!echeance) {
    // La commande existe et tient ses dates ; seul le règlement manque.
    return {
      message:
        "Votre réservation est enregistrée, mais le paiement n'a pas pu être ouvert. " +
        "Retrouvez-la dans votre espace.",
    };
  }

  const cle = randomUUID();
  const { data: paiement, error: ouverture } = await supabase.rpc("start_payment", {
    echeance: echeance.id,
    cle,
  });

  if (ouverture || !paiement) {
    return { message: translate(ouverture?.message ?? "Paiement impossible.") };
  }

  const ligne = Array.isArray(paiement) ? paiement[0] : paiement;

  const { data: profil } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const [prenom, ...reste] = (profil?.full_name ?? "Client ÉniEvent").trim().split(/\s+/);

  const resultat = await paymentProvider().checkout({
    reference: ligne.reference,
    amount: money(ligne.amount, (ligne.currency as CurrencyCode) ?? "XOF"),
    description: `${echeance.label} — réservation ${ordre.reference}`,
    customer: {
      firstName: prenom || "Client",
      lastName: reste.join(" ") || "ÉniEvent",
      email: user.email ?? "",
      phone: profil?.phone ?? null,
    },
    callbackUrl: `${siteUrl()}/paiement/retour?cle=${encodeURIComponent(cle)}`,
    metadata: { cle, instalmentId: echeance.id },
  });

  if (!resultat.ok) {
    return { message: messagePasserelle(resultat.reason, resultat.message) };
  }

  const { error: rattachement } = await supabase.rpc("attach_payment_reference", {
    cle,
    ref: resultat.providerRef,
    adresse: resultat.url,
  });

  if (rattachement) console.error("Rattachement impossible :", rattachement.message);

  return { ok: true, url: resultat.url };
}

function messagePasserelle(reason: string, detail: string): string {
  console.error("FedaPay :", detail);

  if (reason === "non-configure") {
    return "Le paiement en ligne n'est pas encore activé. Contactez-nous pour réserver autrement.";
  }
  if (reason === "refus") {
    return "Le prestataire de paiement a refusé cette demande. Vérifiez vos informations et réessayez.";
  }
  return "Le service de paiement est momentanément indisponible. Réessayez dans quelques minutes.";
}

/** Les messages des fonctions Postgres sont déjà en français et destinés à être lus. */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Réservation impossible.";
}
