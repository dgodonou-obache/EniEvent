import Link from "next/link";

import { StatTile } from "@/components/money/StatTile";
import { requireSpace } from "@/lib/auth/session";
import { getPartnerTakings } from "@/lib/orders";
import { getPartnerPerformance, getPartnerStats } from "@/lib/partner";
import type { CurrencyCode } from "@/lib/money";

/**
 * L'activité du partenaire, en chiffres.
 *
 * ⚠️ **Aucune statistique de consultation.** Ni vues, ni impressions, ni
 * « votre annonce est apparue 340 fois » : le dépôt ne compte rien de tel, et
 * l'inventer serait exactement la preuve fabriquée que le guide §5 interdit.
 * Tout ce qui est affiché ici se recompte ligne à ligne dans la base.
 *
 * ⚠️ **Un taux d'acceptation sans devis tranché vaut `null`, pas zéro.** « 0 % »
 * se lit comme un jugement — « vous ne convertissez rien » — alors que le vrai
 * message est « pas encore assez de données ». La nuance décide si un
 * partenaire reste ou s'en va.
 *
 * **Ce qui manque et qu'on ne cache pas** : le taux de remplissage n'a de sens
 * que rapporté aux dates ouvertes, et un partenaire qui n'ouvre rien n'a pas
 * un mauvais taux — il a un planning vide. L'écran le dit.
 */

export const metadata = { title: "Statistiques" };

export default async function PartnerStatsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orgId = decision.org.orgId;

  const [stats, perf, recettes] = await Promise.all([
    getPartnerStats(orgId),
    getPartnerPerformance(orgId),
    getPartnerTakings(orgId),
  ]);

  const takings = recettes.takings;
  const devise = (takings.currency ?? "XOF") as CurrencyCode;
  const totalDates = perf.openDays + perf.bookedDays;
  const remplissage = totalDates === 0 ? null : Math.round((perf.bookedDays / totalDates) * 100);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Statistiques</h1>
        <p className="mt-1 text-sm text-slate-500">
          Votre activité sur les {perf.days} derniers jours. Tout se recompte dans votre espace.
        </p>
      </div>

      <h2 className="mb-3 text-sm font-bold text-slate-900">Vos devis</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur
          label="Devis envoyés"
          value={`${perf.quotesSent}`}
          hint={
            perf.quotesPending > 0
              ? `${perf.quotesPending} en attente de réponse`
              : "aucun en attente"
          }
        />
        <Compteur
          label="Devis acceptés"
          value={`${perf.quotesAccepted}`}
          hint={perf.quotesDeclined > 0 ? `${perf.quotesDeclined} écartés` : "aucun écarté"}
          tone="bon"
        />
        <Compteur
          label="Taux d'acceptation"
          value={perf.acceptanceRate === null ? "—" : `${perf.acceptanceRate} %`}
          hint={
            perf.acceptanceRate === null
              ? "Aucun devis tranché pour l'instant"
              : "Sur les devis acceptés ou écartés"
          }
        />
        <Compteur
          label="Délai de réponse"
          value={perf.responseHours === null ? "—" : `${perf.responseHours} h`}
          hint={
            perf.responseHours === null
              ? "Pas encore mesurable"
              : "Entre la demande et votre devis"
          }
        />
      </div>

      <h2 className="mb-3 text-sm font-bold text-slate-900">Votre argent</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Encaissé"
          amount={takings.collected}
          currency={devise}
          tone="encaisse"
          hint="Réglé par vos clients, toutes réservations confondues"
        />
        <StatTile
          label="Vous revient"
          amount={takings.partnerDue}
          currency={devise}
          hint="Après commission, versé une fois la prestation faite"
        />
        <Compteur
          label="Réservations"
          value={`${perf.ordersCount}`}
          hint={`Ouvertes sur ${perf.days} jours`}
        />
      </div>

      <h2 className="mb-3 text-sm font-bold text-slate-900">Votre planning</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Compteur
          label="Dates ouvertes"
          value={`${perf.openDays}`}
          hint="À venir, réservables dès maintenant"
        />
        <Compteur label="Dates prises" value={`${perf.bookedDays}`} hint="Déjà réservées" />
        <Compteur
          label="Taux de remplissage"
          value={remplissage === null ? "—" : `${remplissage} %`}
          hint={
            remplissage === null
              ? "Aucune date au planning à venir"
              : "Dates prises sur dates renseignées"
          }
        />
      </div>

      {perf.openDays === 0 ? (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">Aucune date ouverte à venir.</span> Une annonce sans date
          n&apos;apparaît dans aucune recherche de réservation immédiate : ce n&apos;est pas un
          mauvais taux de remplissage, c&apos;est un planning vide.{" "}
          <Link href="/pro/planning" className="font-semibold underline">
            Ouvrir des dates
          </Link>
          .
        </p>
      ) : null}

      {stats.published === 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">Aucune annonce en ligne.</span> Tant qu&apos;aucune
          n&apos;est publiée, ces chiffres resteront à zéro.{" "}
          <Link href="/pro/annonces" className="font-semibold underline">
            Voir mes annonces
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function Compteur({
  label,
  value,
  hint,
  tone = "neutre",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutre" | "bon";
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`mt-1.5 text-xl font-bold tabular-nums ${
          tone === "bon" ? "text-teal-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}
