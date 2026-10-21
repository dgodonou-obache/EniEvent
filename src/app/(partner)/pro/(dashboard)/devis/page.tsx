import Link from "next/link";
import { FileText } from "lucide-react";

import { DataTable, type Colonne, type Ligne, type Ton } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSpace } from "@/lib/auth/session";
import { currencyLabel, format, money, type CurrencyCode } from "@/lib/money";
import { getPartnerQuotes } from "@/lib/quotes";
import { QUOTE_STATUS_LABELS_PARTNER, type QuoteStatus } from "@/lib/states";

/**
 * Les devis d'un prestataire.
 *
 * ⚠️ **C'était une pile de cartes, et elle ne se lisait plus.** À trois devis
 * le format tenait ; à trente, rien n'était comparable — ni deux montants, ni
 * deux échéances, parce que rien n'était aligné. Un tableau répond à la
 * question qu'on se pose vraiment ici : **lequel attend encore une réponse, et
 * combien ai-je engagé.**
 *
 * L'ordre par défaut reste celui de la base — le plus récent d'abord —, et
 * l'écran le dit. Cliquer sur un en-tête l'emporte.
 */

export const metadata = { title: "Mes devis" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function jour(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : JOUR.format(d);
}

const TONS: Record<QuoteStatus, Ton> = {
  draft: "neutre",
  sent: "attente",
  accepted: "succes",
  declined: "alerte",
  withdrawn: "eteint",
  expired: "eteint",
};

/**
 * ⚠️ **La devise monte dans l'en-tête, et seulement si elle est unique.**
 * Répéter « FCFA » sur chaque ligne encombre une colonne dont c'est justement
 * le rôle de s'aligner. Mais le schéma est multi-devise : dès que deux devises
 * se côtoient, chaque montant reprend la sienne, sinon la colonne mentirait.
 */
function colonnes(devise: string | null): Colonne[] {
  return [
    { cle: "reference", libelle: "Référence" },
    { cle: "demande", libelle: "Demande" },
    { cle: "evenement", libelle: "Événement", secondaire: true },
    { cle: "montant", libelle: devise ? `Montant en ${devise}` : "Montant", align: "right" },
    { cle: "etat", libelle: "État" },
  ];
}

export default async function PartnerQuotesPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const quotes = await getPartnerQuotes(decision.org.orgId);

  // Une seule devise sur l'écran : elle peut monter dans l'en-tête.
  const devises = new Set(quotes.map((q) => q.currency ?? "XOF"));
  const commune = devises.size === 1 ? currencyLabel([...devises][0] as CurrencyCode) : null;

  const lignes: Ligne[] = quotes.map((quote) => {
    const item = quote.quote_request_items;
    const request = item?.quote_requests;
    const devise = (quote.currency ?? "XOF") as CurrencyCode;
    const status = quote.status as QuoteStatus;

    return {
      id: quote.id,
      href: `/pro/devis/${quote.id}`,
      valeurs: {
        reference: quote.reference,
        demande: request?.title ?? "Demande retirée",
        evenement: jour(request?.event_date),
        montant:
          quote.subtotal > 0
            ? format(money(quote.subtotal, devise), { withCurrency: commune === null })
            : "—",
        etat: QUOTE_STATUS_LABELS_PARTNER[status],
      },
      details: {
        reference: item?.categories?.name ?? "",
        demande: request?.city ?? "",
      },
      // ⚠️ On trie sur la donnée, jamais sur ce qu'on affiche : « 900 000 FCFA »
      // se range après « 1 100 000 FCFA » en comparaison de chaînes, et
      // « 3 déc. » avant « 5 janv. ». Aucune erreur visible, juste un ordre faux.
      tris: {
        montant: quote.subtotal,
        evenement: request?.event_date ?? "",
        reference: quote.reference,
      },
      tons: { etat: TONS[status] },
      actions: [
        {
          label: status === "draft" ? "Reprendre la rédaction" : "Ouvrir le devis",
          href: `/pro/devis/${quote.id}`,
        },
      ],
    };
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes devis</h1>
        <p className="mt-1 text-sm text-slate-500">
          {quotes.length === 0
            ? "Vous n'avez pas encore rédigé de devis."
            : `${quotes.length} devis · les plus récents d'abord`}
        </p>
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun devis pour l'instant"
          description="Les demandes correspondant à vos annonces arrivent dans « Demandes reçues ». C'est de là que vous rédigez vos propositions."
          action={
            <Link href="/pro/demandes">
              <Button>Voir les demandes</Button>
            </Link>
          }
        />
      ) : (
        <DataTable
          colonnes={colonnes(commune)}
          lignes={lignes}
          objet={{ un: "devis", plusieurs: "devis" }}
        />
      )}
    </div>
  );
}
