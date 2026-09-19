import { createHmac, timingSafeEqual } from "node:crypto";

import { paymentProvider } from "@/lib/payments/fedapay";
import { createServiceRoleClient } from "@/utils/supabase/server";

/**
 * Webhook FedaPay.
 *
 * **Le corps reçu n'est qu'un signal.** Il annonce qu'une transaction a bougé ;
 * il ne prouve rien. À réception, on **relit la transaction chez FedaPay** avec
 * notre clé secrète, et c'est cette lecture qui décide. Rien n'est encaissé sur
 * la foi d'une requête entrante.
 *
 * Ce n'est pas une précaution de façade : FedaPay **n'expose pas** le secret de
 * signature par son API — la création d'un webhook rend `id`, `url`, `enabled`,
 * jamais le secret. Tant que `FEDAPAY_WEBHOOK_SECRET` n'est pas renseigné, le
 * corps est donc strictement non authentifié. La relecture rend cette absence
 * sans conséquence ; la signature, quand elle sera là, n'ajoutera qu'une
 * couche — elle évitera le travail inutile, pas une fraude.
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

export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (secret) {
    const motif = verifySignature(raw, request.headers.get("x-fedapay-signature"), secret);
    if (motif) {
      console.error("Webhook FedaPay rejeté :", motif);
      return Response.json({ error: motif }, { status: 401 });
    }
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "corps illisible" }, { status: 400 });
  }

  const providerRef = extractTransactionId(payload);
  if (!providerRef) {
    return Response.json({ error: "transaction non identifiée" }, { status: 400 });
  }

  // La relecture, et elle seule, fait foi.
  const lecture = await paymentProvider().readTransaction(providerRef);

  if (!lecture.ok) {
    // 500 plutôt que 200 : FedaPay réessaiera, ce qu'on veut si sa propre API
    // était momentanément indisponible.
    console.error(`Relecture de ${providerRef} impossible :`, lecture.message);
    return Response.json({ error: lecture.message }, { status: 502 });
  }

  const tx = lecture.transaction;
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
    // Rien à faire de cette transaction, mais elle n'est pas fautive : un 200
    // évite que FedaPay ne la réessaie indéfiniment.
    console.warn(`Transaction ${providerRef} sans paiement correspondant.`);
    return Response.json({ ignore: "paiement inconnu" });
  }

  const { data, error } = await supabase.rpc("settle_payment", {
    cle,
    ref_prestataire: tx.providerRef,
    etat_prestataire: tx.rawStatus,
    encaisse: tx.state === "paid",
    // Comparé en base à ce qui avait été ouvert : un écart fait échouer le
    // paiement plutôt que de valider une somme inattendue.
    montant_constate: tx.amount,
    detail: tx.state === "paid" ? undefined : `État ${tx.rawStatus}`,
  });

  if (error) {
    console.error("Dénouement impossible :", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const ligne = Array.isArray(data) ? data[0] : data;
  return Response.json({ ok: true, payment: ligne?.reference, status: ligne?.status });
}

/** FedaPay vérifie parfois l'existence du point de terminaison en GET. */
export async function GET() {
  return Response.json({ service: "fedapay", ok: true });
}
