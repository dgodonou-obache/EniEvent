import { createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { paymentProvider } from "@/lib/payments/fedapay";
import { createServiceRoleClient } from "@/utils/supabase/server";

/**
 * Webhook FedaPay.
 *
 * **Le corps reçu n'est qu'un signal.** Il annonce qu'une transaction a bougé ;
 * il ne prouve rien. La transaction est **relue chez FedaPay** avec notre clé
 * secrète, et c'est cette lecture qui décide. Rien n'est encaissé sur la foi
 * d'une requête entrante — FedaPay n'exposant pas le secret de signature par
 * son API, le corps n'est pas authentifié tant que `FEDAPAY_WEBHOOK_SECRET`
 * n'est pas renseigné.
 *
 * **On accuse réception avant de vérifier**, et non l'inverse. La relecture
 * coûte un aller-retour réseau : en la plaçant avant la réponse, une exécution
 * à froid mettait 2,3 secondes, et le moindre incident chez nous — une clé
 * absente, une API lente — se traduisait par un code d'erreur. FedaPay
 * désactive un point de terminaison qui échoue de façon répétée, et l'a fait :
 * le webhook s'est éteint sans que rien ne le signale de notre côté. C'est la
 * panne la plus sournoise du tunnel, puisqu'elle est silencieuse.
 *
 * Le travail part donc dans `after()` : la réponse est rendue en quelques
 * dizaines de millisecondes, et l'échec éventuel du traitement est rattrapé par
 * `/api/cron/paiements`, qui relit les paiements restés en attente. Un webhook
 * qu'on ne peut plus décevoir vaut mieux qu'un webhook qu'on croit fiable.
 *
 * C'est l'un des rares endroits où `SUPABASE_SECRET_KEY` est admise
 * (`CLAUDE.md` §3) : un webhook n'a pas d'utilisateur.
 */

export const dynamic = "force-dynamic";

/** Tolérance sur l'horodatage signé, contre le rejeu d'une capture ancienne. */
const FENETRE_SECONDES = 5 * 60;

/**
 * Vérifie l'en-tête `x-fedapay-signature`, de forme `t=<horodatage>,s=<hmac>`.
 * Renvoie `null` si tout va bien, un motif sinon.
 */
export function verifySignature(
  raw: string,
  header: string | null,
  secret: string,
  maintenant = Date.now(),
): string | null {
  if (!header) return "signature absente";

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );

  const horodatage = parts.t;
  const signature = parts.s;
  if (!horodatage || !signature) return "signature mal formée";

  const age = Math.abs(maintenant / 1000 - Number(horodatage));
  if (!Number.isFinite(age) || age > FENETRE_SECONDES) return "horodatage hors fenêtre";

  const attendu = createHmac("sha256", secret).update(`${horodatage}.${raw}`).digest("hex");

  const a = Buffer.from(attendu, "utf8");
  const b = Buffer.from(signature, "utf8");
  // Comparaison à temps constant : une comparaison ordinaire fuit la signature
  // attendue, octet par octet, par le temps qu'elle met à échouer.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "signature invalide";

  return null;
}

/** Retrouve l'identifiant de transaction, quelle que soit la forme de l'envoi. */
export function extractTransactionId(payload: unknown): string | null {
  const body = payload as Record<string, unknown> | null;
  if (!body) return null;

  const entity = (body.entity ?? body.data ?? body) as Record<string, unknown>;
  const id = entity?.id ?? body.id;

  return id === undefined || id === null ? null : String(id);
}

/**
 * Relecture puis dénouement. Exécuté **après** la réponse : tout échec ici est
 * journalisé et rattrapé par la tâche planifiée, jamais renvoyé à FedaPay.
 */
async function verifierEtDenouer(providerRef: string): Promise<void> {
  const lecture = await paymentProvider().readTransaction(providerRef);

  if (!lecture.ok) {
    console.error(`Relecture de ${providerRef} impossible :`, lecture.message);
    return;
  }

  const tx = lecture.transaction;

  // Un état non terminal ne se dénoue pas. Un webhook peut arriver pendant que
  // le client est encore sur la page de l'opérateur — ou être appelé par
  // n'importe qui, le corps n'étant pas authentifié. Conclure ici marquerait
  // « échoué » un paiement en cours, que le client ne pourrait plus terminer.
  if (tx.state === "pending") return;

  const supabase = createServiceRoleClient();

  // La clé recopiée dans les métadonnées à l'ouverture. Le repli par
  // `provider_ref` couvre une transaction créée hors de notre tunnel.
  let cle = typeof tx.metadata.cle === "string" ? tx.metadata.cle : null;

  if (!cle) {
    const { data } = await supabase
      .from("payments")
      .select("idempotency_key")
      .eq("provider_ref", providerRef)
      .maybeSingle();
    cle = data?.idempotency_key ?? null;
  }

  if (!cle) {
    console.warn(`Transaction ${providerRef} sans paiement correspondant.`);
    return;
  }

  const { error } = await supabase.rpc("settle_payment", {
    cle,
    ref_prestataire: tx.providerRef,
    etat_prestataire: tx.rawStatus,
    encaisse: tx.state === "paid",
    // Comparé en base à ce qui avait été ouvert : un écart fait échouer le
    // paiement plutôt que de valider une somme inattendue.
    montant_constate: tx.amount,
    detail: tx.state === "paid" ? undefined : `État ${tx.rawStatus}`,
  });

  if (error) console.error("Dénouement impossible :", error.message);
}

export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (secret) {
    const motif = verifySignature(raw, request.headers.get("x-fedapay-signature"), secret);
    if (motif) {
      // Le seul refus légitime : une requête dont on sait qu'elle ne vient pas
      // de FedaPay. La rejouer n'y changerait rien, d'où le 401.
      console.error("Webhook FedaPay rejeté :", motif);
      return Response.json({ error: motif }, { status: 401 });
    }
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("Webhook FedaPay : corps illisible");
    // 200 malgré tout : un corps que nous ne savons pas lire ne deviendra pas
    // lisible à la tentative suivante, et un échec répété éteint le webhook.
    return Response.json({ ignore: "corps illisible" });
  }

  const providerRef = extractTransactionId(payload);

  if (!providerRef) {
    console.error("Webhook FedaPay : transaction non identifiée");
    return Response.json({ ignore: "transaction non identifiée" });
  }

  // Accusé de réception immédiat ; la vérification suit hors du chemin de
  // réponse. Voir l'en-tête du module.
  after(() => verifierEtDenouer(providerRef));

  return Response.json({ ok: true, received: providerRef });
}

/** FedaPay vérifie parfois l'existence du point de terminaison en GET. */
export async function GET() {
  return Response.json({ service: "fedapay", ok: true });
}
