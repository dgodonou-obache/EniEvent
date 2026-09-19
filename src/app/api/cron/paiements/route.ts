import { paymentProvider } from "@/lib/payments/fedapay";
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

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "non autorisé" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const maintenant = Date.now();

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
  const rapport = { examines: enAttente?.length ?? 0, encaisses: 0, echoues: 0, inchanges: 0 };

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

  return Response.json(rapport);
}
