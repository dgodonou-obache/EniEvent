import Link from "next/link";
import { CalendarCheck, CreditCard, FileText, Sparkles } from "lucide-react";

import { OrderRow } from "@/components/money/OrderRow";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { daysUntil } from "@/lib/cancellation";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getMyOrders, type OrderView } from "@/lib/orders";
import { getMyRequests } from "@/lib/quotes";

/**
 * L'accueil de l'espace client.
 *
 * ⚠️ **Cette page était un écran d'attente, et elle l'est restée bien après que
 * son contenu soit devenu disponible.** Elle annonçait « Lot 2 — Réservation &
 * paiement » alors que réservations, échéances et devis sont en production
 * depuis des semaines : le premier écran que voit un client connecté lui disait
 * que le produit n'était pas fini.
 *
 * ⚠️ **Et aucun contrôle ne pouvait l'attraper.** `tests/roadmap.test.ts` garde
 * `lotFor()` et interdit l'ancienne numérotation — mais cette page **codait son
 * lot en dur** au lieu de l'y demander, et passait donc à côté. `smoke:ecrans`
 * la voyait rendre un `<h1>` et la comptait pour un succès. Le décompte de
 * `docs/LOTS.md`, qui cherche un `page.tsx` par entrée de menu, la comptait
 * pour livrée. Trois contrôles, trois angles morts, parce qu'aucun ne regarde
 * ce que la page **dit**.
 *
 * Ce qu'un client vient chercher ici tient en trois questions, dans cet ordre :
 * **qu'est-ce que je dois payer**, **qu'est-ce qui arrive**, et **qu'est-ce qui
 * attend ma réponse**. Chaque bloc ne s'affiche que s'il a quelque chose à
 * dire — un bloc « Rien à régler » occuperait la place sans rien apprendre.
 */

export const metadata = { title: "Mon compte" };

/** Au-delà, l'échéance n'appelle pas encore d'action : elle encombrerait. */
const HORIZON_JOURS = 60;

export default async function AccountOverviewPage() {
  await requireUser();

  const [orders, demandes] = await Promise.all([getMyOrders(), getMyRequests()]);

  const vivantes = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");

  // 1. Ce qui attend un règlement. Les échéances les plus proches d'abord :
  //    une date sans date d'échéance passe en dernier, elle n'est pas pressée.
  const aRegler = vivantes
    .filter((o) => o.next !== null)
    .sort((a, b) => (a.next?.dueDate ?? "9999").localeCompare(b.next?.dueDate ?? "9999"));

  // 2. Ce qui arrive. Calendaire, comme partout ailleurs : aucun état de
  //    commande ne dit qu'une prestation a eu lieu.
  const aVenir = vivantes
    .filter((o) => {
      const jours = daysUntil(o.endDate ?? o.eventDate);
      return jours !== null && jours >= 0;
    })
    .sort((a, b) =>
      (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"),
    );

  // 3. Ce qui attend une réponse. Un devis compte s'il a été **envoyé** et que
  //    le besoin n'a pas encore été attribué : un brouillon de partenaire est
  //    invisible du client, et un besoin attribué est tranché.
  const aComparer = demandes
    .map((demande) => ({
      demande,
      offres: (demande.quote_request_items ?? []).reduce(
        (total, item) =>
          total +
          (item.awarded_quote_id
            ? 0
            : (item.quotes ?? []).filter((q) => q.status === "sent").length),
        0,
      ),
    }))
    .filter(({ offres }) => offres > 0);

  const devise = (orders[0]?.currency as CurrencyCode) ?? "XOF";
  const resteARegler = aRegler.reduce((total, o) => total + (o.next?.amount ?? 0), 0);

  const rienAMontrer =
    aRegler.length === 0 && aVenir.length === 0 && aComparer.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mon compte</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rienAMontrer
            ? "Rien ne vous attend pour l'instant."
            : "Ce qui demande votre attention, le plus proche en premier."}
        </p>
      </div>

      {rienAMontrer ? (
        <EmptyState
          icon={Sparkles}
          title="Votre espace est prêt"
          description="Vous n'avez ni règlement en attente, ni réservation à venir, ni devis à comparer. Explorez le catalogue pour réserver un lieu ou un prestataire, ou décrivez votre projet pour recevoir des propositions."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/recherche">
                <Button>Explorer le catalogue</Button>
              </Link>
              <Link href="/demande-de-devis">
                <Button variant="outline">Décrire mon projet</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-8">
          {aRegler.length > 0 ? (
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold text-slate-900">À régler</h2>
                <p className="text-sm text-slate-500">
                  <span className="font-bold tabular-nums text-orange-600">
                    {format(money(resteARegler, devise))}
                  </span>{" "}
                  sur {aRegler.length} réservation{aRegler.length > 1 ? "s" : ""}
                </p>
              </div>

              <ul className="space-y-3">
                {aRegler.slice(0, 3).map((order) => (
                  <li key={order.id}>
                    <Echeance order={order} />
                  </li>
                ))}
              </ul>

              <Lien href="/compte/reservations" nombre={aRegler.length} seuil={3}>
                Voir mes réservations
              </Lien>
            </section>
          ) : null}

          {aVenir.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Prochains événements</h2>
              <ul className="space-y-3">
                {aVenir.slice(0, 3).map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} perspective="client" />
                  </li>
                ))}
              </ul>

              <Lien href="/compte/reservations" nombre={aVenir.length} seuil={3}>
                Voir mes réservations
              </Lien>
            </section>
          ) : null}

          {aComparer.length > 0 ? (
            <section>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Devis à comparer</h2>
              <p className="mb-3 text-sm text-slate-500">
                Prenez le temps de comparer : le prix, ce qui est inclus et les conditions
                d&apos;annulation comptent autant les uns que les autres.
              </p>

              <ul className="space-y-3">
                {aComparer.slice(0, 3).map(({ demande, offres }) => (
                  <li key={demande.id}>
                    <Link
                      href={`/projets/${demande.id}`}
                      className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50 active:scale-[0.98]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                        <FileText className="h-5 w-5 text-orange-500" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{demande.title}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {offres} offre{offres > 1 ? "s" : ""} à comparer
                          {demande.city ? ` · ${demande.city}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              <Lien href="/projets" nombre={aComparer.length} seuil={3}>
                Voir mes projets
              </Lien>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Une échéance à venir.
 *
 * ⚠️ **La somme affichée est celle de l'échéance, pas le total de la commande.**
 * C'est elle qu'on doit sortir maintenant ; annoncer le total ferait croire à
 * une dette plus grosse qu'elle n'est.
 */
function Echeance({ order }: { order: OrderView }) {
  const devise = order.currency as CurrencyCode;
  const jours = daysUntil(order.next?.dueDate ?? null);

  const quand =
    jours === null
      ? "Dès que possible"
      : jours < 0
        ? "En retard"
        : jours === 0
          ? "Aujourd'hui"
          : jours === 1
            ? "Demain"
            : `Dans ${jours} jours`;

  // Au-delà de l'horizon, l'échéance existe mais n'appelle pas d'action : on le
  // dit d'un ton neutre plutôt que de l'habiller en urgence.
  const presse = jours !== null && jours <= 7;
  const lointain = jours !== null && jours > HORIZON_JOURS;

  return (
    <Link
      href="/compte/reservations"
      className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50 active:scale-[0.98]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
        <CreditCard className="h-5 w-5 text-orange-500" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-slate-900">
          {order.listingTitle ?? order.partnerName ?? order.reference}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {order.next?.label ?? "Règlement"} ·{" "}
          <span className={lointain ? "" : presse ? "font-semibold text-orange-600" : ""}>
            {quand}
          </span>
        </p>
      </div>

      <p className="shrink-0 font-bold tabular-nums text-slate-900">
        {format(money(order.next?.amount ?? 0, devise))}
      </p>
    </Link>
  );
}

/**
 * Le lien vers la liste complète.
 *
 * Il n'apparaît que lorsqu'il reste quelque chose à voir : proposer « voir
 * les 2 » sous deux lignes déjà affichées fait cliquer pour rien.
 */
function Lien({
  href,
  nombre,
  seuil,
  children,
}: {
  href: string;
  nombre: number;
  seuil: number;
  children: React.ReactNode;
}) {
  if (nombre <= seuil) return null;

  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition-all duration-200 hover:text-orange-700"
    >
      <CalendarCheck className="h-4 w-4" aria-hidden />
      {children} ({nombre})
    </Link>
  );
}
