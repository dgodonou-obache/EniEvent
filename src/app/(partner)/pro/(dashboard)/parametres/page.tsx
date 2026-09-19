import { CalendarClock } from "lucide-react";

import { ScheduleEditor } from "@/components/partner/ScheduleEditor";
import { requireSpace } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";

/**
 * Conditions de règlement du partenaire.
 *
 * Premier écran de `/pro/parametres`. Il ne traite volontairement que du
 * paiement : c'est ce qui bloque aujourd'hui le tunnel — un partenaire ne
 * pouvait pas décider quand ni comment il est payé, et héritait d'un acompte
 * de 30 % choisi à sa place.
 */

export const metadata = { title: "Paramètres" };

export default async function PartnerSettingsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;

  const supabase = await createClient();
  const { data: lignes } = await supabase
    .from("payment_schedules")
    .select("*")
    .eq("org_id", orgId)
    .order("position");

  const initial = (lignes ?? []).map((l) => ({
    cle: l.id,
    label: l.label,
    trigger: l.trigger as "booking" | "before_event",
    daysBefore: l.days_before === null ? "" : String(l.days_before),
    kind: l.amount_kind as "percent" | "fixed" | "balance",
    percent: l.percent === null ? "" : String(Number(l.percent)),
    fixedAmount: l.fixed_amount === null ? "" : String(l.fixed_amount),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les conditions selon lesquelles vos clients vous règlent.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
            <CalendarClock className="h-5 w-5 text-orange-500" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">Échéancier de paiement</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Composez vos échéances : un acompte à la réservation, des versements un certain
              nombre de jours avant l&apos;événement, en pourcentage ou en montant fixe. Le client
              voit l&apos;échéancier complet avant de s&apos;engager.
            </p>
          </div>
        </div>

        <ScheduleEditor orgId={orgId} initial={initial} />
      </section>
    </div>
  );
}
