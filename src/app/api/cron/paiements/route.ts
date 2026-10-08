import { bearerMatches } from "@/lib/auth/bearer";
import { paymentProvider } from "@/lib/payments/fedapay";
import type { WebhookHealth } from "@/lib/payments/provider";
import { createServiceRoleClient } from "@/utils/supabase/server";

/**
 * Rattrapage des paiements restés en attente.
 *
 * Le webhook est le chemin normal ; celui-ci est le filet. Un webhook peut ne
 * pas arriver — déploiement en cours, coupure réseau, point de terminaison
 * momentanément en erreur — et FedaPay finit par renoncer. Sans rattrapage, un
 * client aurait payé et la commande serait restée impayée dans nos écrans :
 * c'est la panne la plus coûteuse de tout le tunnel, parce que personne ne la
 * voit avant la réclamation.
 *
 * Même règle que le webhook : **on relit la transaction chez le prestataire**,
 * et cette lecture seule décide.
 *
 * C'est une tâche planifiée : `SUPABASE_SECRET_KEY` y est admise (`CLAUDE.md` §3).
 */

export const dynamic = "force-dynamic";

/** En deçà, le webhook a encore toutes les chances d'arriver le premier. */
const DELAI_MINUTES = 3;

/** Au-delà, le client a abandonné depuis longtemps ; inutile de relire sans fin. */
const ABANDON_HEURES = 48;

/** Borne le temps d'exécution : la tâche repassera. */
const LOT = 25;

export async function POST(request: Request) {
  return GET(request);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  }

  // Comparaison en temps constant : voir `src/lib/auth/bearer.ts`.
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "non autorisé" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const maintenant = Date.now();

  // Les dates d'une réservation immédiate sont retenues dès la commande, pour
  // que deux clients ne se disputent pas le même samedi pendant la saisie. Sans
  // cette libération, le premier panier abandonné condamnerait la date.
  const { data: liberees, error: erreurLiberation } = await supabase.rpc("release_stale_orders");

  if (erreurLiberation) {
    console.error("Libération des dates impossible :", erreurLiberation.message);
  }

  const { data: enAttente, error } = await supabase
    .from("payments")
    .select("idempotency_key, provider_ref, amount, created_at")
    .eq("status", "pending")
    .not("provider_ref", "is", null)
    .lte("created_at", new Date(maintenant - DELAI_MINUTES * 60_000).toISOString())
    .gte("created_at", new Date(maintenant - ABANDON_HEURES * 3_600_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(LOT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const provider = paymentProvider();
  const rapport = {
    datesLiberees: liberees ?? 0,
    examines: enAttente?.length ?? 0,
    encaisses: 0,
    echoues: 0,
    inchanges: 0,
  };

  for (const paiement of enAttente ?? []) {
    const lecture = await provider.readTransaction(paiement.provider_ref!);

    if (!lecture.ok) {
      // Une lecture impossible n'est pas un échec de paiement : on laisse la
      // ligne en attente plutôt que de la déclarer perdue.
      console.error(`Relecture de ${paiement.provider_ref} impossible :`, lecture.message);
      continue;
    }

    const tx = lecture.transaction;

    if (tx.state === "pending") {
      rapport.inchanges += 1;
      continue;
    }

    const { error: erreur } = await supabase.rpc("settle_payment", {
      cle: paiement.idempotency_key,
      ref_prestataire: tx.providerRef,
      etat_prestataire: tx.rawStatus,
      encaisse: tx.state === "paid",
      montant_constate: tx.amount,
      detail: tx.state === "paid" ? undefined : `Rattrapage — état ${tx.rawStatus}`,
    });

    if (erreur) {
      console.error("Dénouement impossible :", erreur.message);
      continue;
    }

    if (tx.state === "paid") rapport.encaisses += 1;
    else rapport.echoues += 1;
  }

  // Un webhook éteint est la panne la plus sournoise du tunnel : FedaPay le
  // désactive après quelques échecs, n'en informe que par courrier, et plus
  // rien n'arrive sans qu'aucun écran ne le montre. On le vérifie ici, où le
  // résultat remonte dans le résumé de la tâche planifiée.
  const verdict = verdictWebhook(await provider.webhookHealth());

  if (verdict !== "actif") {
    console.error(`Webhook FedaPay : ${verdict} — les paiements ne remonteront plus`);
  }

  return Response.json({ ...rapport, webhook: verdict });
}

/** Le chemin que FedaPay doit appeler. Comparé par le chemin, pas par l'hôte :
 *  la production et son alias `*.vercel.app` sont tous deux légitimes. */
const CHEMIN_ATTENDU = "/api/webhooks/fedapay";

/**
 * Le webhook est-il en état de nous prévenir ?
 *
 * ⚠️ **Assertion positive.** On ne compte pas les webhooks désactivés — on
 * exige que **le nôtre** figure parmi les actifs. Compter des absences faisait
 * passer trois pannes pour une bonne santé : aucun webhook déclaré, liste
 * illisible, et webhook pointant ailleurs rendaient tous « zéro désactivé ».
 * Même leçon que les droits de colonne : seule l'énumération positive dit
 * quelque chose.
 *
 * Exporté pour être éprouvé sans réseau.
 */
export function verdictWebhook(
  sante: WebhookHealth,
): "actif" | "désactivé" | "absent" | "illisible" {
  if (!sante.lisible) return "illisible";

  const notre = (u: string) => {
    try {
      return new URL(u).pathname.replace(/\/$/, "") === CHEMIN_ATTENDU;
    } catch {
      return false;
    }
  };

  if (sante.actifs.some(notre)) return "actif";
  if (sante.desactives.some(notre)) return "désactivé";

  return "absent";
}
