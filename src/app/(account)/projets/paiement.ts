"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { money, type CurrencyCode } from "@/lib/money";
import { paymentProvider } from "@/lib/payments/fedapay";
import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Ouverture d'un paiement.
 *
 * **Le montant n'est pas transmis.** Seuls la commande et la nature du
 * règlement le sont ; `start_payment` déduit la somme de la commande, figée à
 * l'acceptation du devis. Revérifier un montant côté serveur n'aurait aucun
 * sens si le formulaire avait pu le choisir.
 *
 * Cette action n'emploie **pas** la clé de service : elle est déclenchée par un
 * utilisateur, et le `CLAUDE.md` la réserve aux webhooks et aux tâches
 * planifiées. Toute l'autorisation est donc portée par les fonctions
 * `SECURITY DEFINER`, qui vérifient elles-mêmes l'appelant.
 */

type PaymentPurpose = Database["public"]["Enums"]["payment_purpose"];

export interface PaymentState {
  message?: string;
  /** Adresse de la page du prestataire, à ouvrir côté client. */
  url?: string;
  ok?: boolean;
}

/** Au-delà, la page du prestataire a pu expirer : on en rouvre une. */
const REPRISE_MINUTES = 20;

export async function payOrder(
  _previous: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const user = await requireUser();

  const orderId = String(formData.get("orderId") ?? "");
  const purpose = String(formData.get("purpose") ?? "") as PaymentPurpose;
  const requestId = String(formData.get("requestId") ?? "");

  if (!orderId || !["deposit", "balance", "full"].includes(purpose)) {
    return { message: "Paiement impossible : demande incomplète." };
  }

  const supabase = await createClient();

  // Un client qui revient sur la page après avoir fermé son onglet retrouve sa
  // page de paiement, plutôt que d'ouvrir une seconde transaction chez le
  // prestataire pour la même somme.
  const depuis = new Date(Date.now() - REPRISE_MINUTES * 60_000).toISOString();
  const { data: encours } = await supabase
    .from("payments")
    .select("payload, created_at")
    .eq("order_id", orderId)
    .eq("purpose", purpose)
    .eq("status", "pending")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reprise = (encours?.payload as { url?: string } | null)?.url;
  if (reprise) return { ok: true, url: reprise };

  // Une clé par tentative : deux clics rapides ouvrent deux lignes en attente,
  // ce qui est sans danger — l'index partiel `payments_one_paid_per_purpose`
  // interdit d'en encaisser deux.
  const cle = randomUUID();

  const { data: paiement, error } = await supabase.rpc("start_payment", {
    target: orderId,
    nature: purpose,
    cle,
  });

  if (error || !paiement) {
    return { message: translate(error?.message ?? "Paiement impossible.") };
  }

  const ligne = Array.isArray(paiement) ? paiement[0] : paiement;

  const { data: profil } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const [prenom, ...reste] = (profil?.full_name ?? "Client ÉniEvent").trim().split(/\s+/);

  const provider = paymentProvider();
  const ouverture = await provider.checkout({
    reference: ligne.reference,
    amount: money(ligne.amount, (ligne.currency as CurrencyCode) ?? "XOF"),
    description: `${libelle(purpose)} — commande ${ligne.reference}`,
    customer: {
      firstName: prenom || "Client",
      lastName: reste.join(" ") || "ÉniEvent",
      email: user.email ?? "",
      phone: profil?.phone ?? null,
    },
    callbackUrl: `${siteUrl()}/paiement/retour?cle=${encodeURIComponent(cle)}`,
    // Recopiées chez le prestataire : c'est par elles que le webhook retrouve
    // le paiement, sans jamais croire ce que le navigateur renvoie.
    metadata: { cle, orderId, purpose },
  });

  if (!ouverture.ok) {
    return { message: messagePasserelle(ouverture.reason, ouverture.message) };
  }

  // Sans ce rattachement, une transaction payée resterait orpheline : le
  // webhook saurait quoi encaisser, mais la tâche de rattrapage ne saurait pas
  // quelles transactions relire.
  const { error: rattachement } = await supabase.rpc("attach_payment_reference", {
    cle,
    ref: ouverture.providerRef,
    adresse: ouverture.url,
  });

  if (rattachement) {
    console.error("Rattachement impossible :", rattachement.message);
  }

  if (requestId) revalidatePath(`/projets/${requestId}`);

  return { ok: true, url: ouverture.url };
}

function libelle(purpose: PaymentPurpose): string {
  if (purpose === "deposit") return "Acompte";
  if (purpose === "balance") return "Solde";
  return "Paiement";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://enievent.com").replace(/\/+$/, "");
}

/**
 * Un échec de paiement doit dire quoi faire. « Erreur 500 » laisse le client
 * recommencer indéfiniment la même chose.
 */
function messagePasserelle(reason: string, detail: string): string {
  console.error("FedaPay :", detail);

  if (reason === "non-configure") {
    return "Le paiement en ligne n'est pas encore activé. Contactez-nous pour régler autrement.";
  }
  if (reason === "refus") {
    return "Le prestataire de paiement a refusé cette demande. Vérifiez vos informations et réessayez.";
  }
  return "Le service de paiement est momentanément indisponible. Réessayez dans quelques minutes.";
}

/** Les messages des fonctions Postgres sont déjà en français et destinés à être lus. */
function translate(message: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || "Paiement impossible.";
}
