import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { DataTable, type Colonne, type Ligne, type Ton } from "@/components/dashboard/DataTable";
import { StatTile } from "@/components/money/StatTile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { format, money, type CurrencyCode } from "@/lib/money";
import { getPartnerOrders, type OrderStatus } from "@/lib/orders";

/**
 * Réservations reçues par un partenaire.
 *
 * Une commande naît d'un devis accepté ou d'une réservation immédiate ; les
 * deux se lisent ici de la même façon. L'ordre est le plus récent d'abord :
 * c'est ce qui appelle une action.
 *
 * ⚠️ **C'était trois blocs empilés par réservation** — la carte, le bloc
 * d'annulation, la boîte de litige — dépliés sous chaque ligne. Au-delà de
 * quelques réservations on ne parcourait plus rien, et les deux chiffres qu'un
 * prestataire cherche vraiment (ce qu'il touche, ce qui reste à encaisser)
 * étaient noyés. Le tableau ne porte que la lecture ; les gestes vivent sur la
 * fiche, `/pro/reservations/[id]`, comme partout ailleurs dans le dépôt.
 *
 * Les trois tuiles du haut restent : elles répondent d'un coup d'œil à « combien
 * ai-je en route », ce qu'aucune ligne de tableau ne dira.
 */

export const metadata = { title: "Mes réservations" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function jour(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : JOUR.format(d);
}

const TONS: Record<OrderStatus, Ton> = {
  pending_payment: "attente",
  deposit_paid: "attente",
  paid: "succes",
  cancelled: "eteint",
  refunded: "alerte",
};

const COLONNES: Colonne[] = [
  { cle: "reference", libelle: "Référence" },
  { cle: "evenement", libelle: "Événement" },
  { cle: "montant", libelle: "Montant", align: "right" },
  { cle: "part", libelle: "Vous touchez", align: "right", secondaire: true },
  { cle: "encaisse", libelle: "Encaissé", align: "right", secondaire: true },
  { cle: "etat", libelle: "État" },
];

export default async function PartnerBookingsPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const orders = await getPartnerOrders(decision.org.orgId);
  const devise = orders[0]?.currency ?? "XOF";

  const encours = orders.filter((o) => o.status === "pending_payment" || o.status === "deposit_paid");
  const soldees = orders.filter((o) => o.status === "paid");

  const lignes: Ligne[] = orders.map((order) => {
    const monnaie = order.currency as CurrencyCode;
    const somme = (n: number) => format(money(n, monnaie));
    const reglees = order.instalments.filter((i) => i.paid).length;

    return {
      id: order.id,
      href: `/pro/reservations/${order.id}`,
      valeurs: {
        reference: order.reference,
        evenement: jour(order.eventDate),
        montant: somme(order.total),
        part: somme(order.partnerDue),
        encaisse: somme(order.paidAmount),
        etat: order.statusLabel,
      },
      details: {
        reference: order.listingTitle ?? "",
        // « 2 sur 3 échéances » dit l'avancement sans le traduire en
        // pourcentage : on compte des versements, on ne les calcule pas.
        encaisse:
          order.instalments.length > 0
            ? `${reglees} sur ${order.instalments.length} échéance${order.instalments.length > 1 ? "s" : ""}`
            : "",
      },
      // ⚠️ On trie sur la donnée, jamais sur ce qu'on affiche.
      tris: {
        montant: order.total,
        part: order.partnerDue,
        encaisse: order.paidAmount,
        evenement: order.eventDate ?? "",
        reference: order.reference,
      },
      tons: { etat: TONS[order.status] },
      actions: [
        { label: "Voir le détail", href: `/pro/reservations/${order.id}` },
        // L'annulation n'est offerte que là où elle est réellement possible :
        // un lien vers un bouton absent se lit comme une panne.
        ...(order.cancellable
          ? [{ label: "Annuler la réservation", href: `/pro/reservations/${order.id}#annuler` }]
          : []),
      ],
    };
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes réservations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {orders.length === 0
            ? "Aucune réservation pour l'instant."
            : `${orders.length} réservation${orders.length > 1 ? "s" : ""} · les plus récentes d'abord`}
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Aucune réservation pour l'instant"
          description="Une réservation naît d'un devis accepté, ou d'un client qui réserve directement une de vos annonces. Vérifiez que vos annonces sont publiées et votre planning ouvert."
          action={
            <Link href="/pro/annonces">
              <Button>Voir mes annonces</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="En cours"
              amount={encours.reduce((t, o) => t + o.partnerDue, 0)}
              currency={devise}
              tone="attente"
              hint={`${encours.length} réservation${encours.length > 1 ? "s" : ""} pas encore soldée${encours.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Soldées"
              amount={soldees.reduce((t, o) => t + o.partnerDue, 0)}
              currency={devise}
              tone="encaisse"
              hint={`${soldees.length} réservation${soldees.length > 1 ? "s" : ""} intégralement réglée${soldees.length > 1 ? "s" : ""}`}
            />
            <StatTile
              label="Volume total"
              amount={orders.reduce((t, o) => t + o.total, 0)}
              currency={devise}
              hint="Ce que les clients ont engagé, commission comprise"
            />
          </div>

          <DataTable
            colonnes={COLONNES}
            lignes={lignes}
            objet={{ un: "réservation", plusieurs: "réservations" }}
          />
        </>
      )}
    </div>
  );
}
