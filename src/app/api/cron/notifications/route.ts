import { publicEnv } from "@/lib/env";
import { renderSms } from "@/lib/notify/messages";
import { sendSms } from "@/lib/sms/premux";
import { createServiceRoleClient } from "@/utils/supabase/server";

/**
 * Vidage de la file de notifications.
 *
 * **C'est le seul endroit autorisé à employer la clé de service** pour cette
 * fonctionnalité : `CLAUDE.md` la réserve aux webhooks et aux tâches
 * planifiées, jamais à une Server Action déclenchée par un utilisateur. C'est
 * précisément pourquoi l'envoi passe par une file plutôt que par un appel
 * direct au moment du dépôt d'un brief.
 *
 * `claim_notifications` réserve les lignes avec `for update skip locked` :
 * deux exécutions qui se chevauchent ne peuvent pas envoyer deux fois le même
 * SMS — une garantie qui vaut de l'argent réel, chaque envoi étant facturé.
 *
 * Vercel appelle cette route avec `Authorization: Bearer $CRON_SECRET` dès que
 * la variable est définie sur le projet. Sans secret configuré, la route refuse
 * tout : mieux vaut une file qui ne part pas qu'une URL publique capable de
 * vider votre crédit SMS.
 */

export const dynamic = "force-dynamic";

/**
 * `pg_net` appelle en POST, la tâche planifiée Vercel en GET. Le traitement est
 * le même : vider la file. On expose donc les deux verbes plutôt que de forcer
 * l'un des deux appelants à se contorsionner.
 */
export async function POST(request: Request) {
  return GET(request);
}

/** Au-delà, la fonction risque le délai d'exécution. La tâche repassera. */
const BATCH = 25;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "non autorisé" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Les rappels d'échéance sont posés ici, et non par un déclencheur : rien ne
  // se passe en base au moment où le temps s'écoule. La fonction est idempotente
  // — la contrainte d'unicité de `notifications` refuse un second rappel pour la
  // même demande — donc la tâche peut repasser toutes les quinze minutes.
  const { data: rappels, error: erreurRappels } = await supabase.rpc("enqueue_deadline_reminders");

  if (erreurRappels) {
    // Un rappel manqué ne doit pas empêcher le reste de partir : on poursuit.
    console.error("Rappels d'échéance impossibles :", erreurRappels.message);
  }

  const { data: claimed, error } = await supabase.rpc("claim_notifications", { batch: BATCH });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? publicEnv().supabaseUrl;
  const report = {
    rappelsPoses: rappels ?? 0,
    traitees: claimed?.length ?? 0,
    envoyees: 0,
    echouees: 0,
  };

  for (const row of claimed ?? []) {
    const body = renderSms(row.kind, (row.payload ?? {}) as Record<string, unknown>, siteUrl);

    if (!body) {
      // Un type inconnu ne doit pas bloquer la file ni partir vide : on le
      // marque en échec avec un motif lisible dans `last_error`.
      await supabase.rpc("mark_notification", {
        target: row.id,
        delivered: false,
        detail: `Type de notification inconnu : ${row.kind}`,
      });
      report.echouees += 1;
      continue;
    }

    const outcome =
      row.channel === "sms"
        ? await sendSms(row.recipient, body)
        : ({ ok: false, reason: "passerelle", message: "Canal e-mail pas encore branché" } as const);

    await supabase.rpc("mark_notification", {
      target: row.id,
      delivered: outcome.ok,
      // `detail` porte une valeur par défaut côté SQL : `undefined` la laisse
      // jouer, là où `null` serait refusé par la signature générée.
      detail: outcome.ok ? undefined : outcome.message,
    });

    if (outcome.ok) report.envoyees += 1;
    else report.echouees += 1;
  }

  return Response.json(report);
}
