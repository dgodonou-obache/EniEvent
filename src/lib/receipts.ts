import "server-only";

import { type CurrencyCode } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

/**
 * Reçus de paiement du client.
 *
 * ⚠️ **Un reçu n'est pas une facture, et l'écran ne doit jamais dire
 * « facture ».** Un reçu atteste qu'une somme a été encaissée ; une facture
 * est une pièce fiscale, qui engage un numéro de RCCM, un IFU et une mention
 * de TVA. `src/lib/legal.ts` porte encore ces valeurs à `null` : émettre une
 * pièce qui s'annonce comme une facture serait faux, et en matière fiscale
 * c'est faux dans le sens qui coûte cher. La facture arrive avec le lot B.
 *
 * ⚠️ **Aucun montant n'est recalculé ici.** Le reçu relit `payments`, dont la
 * ventilation est écrite à l'encaissement sous une contrainte qui garantit
 * `commission + partner_due = amount`. Un reçu qui referait la division
 * pourrait diverger de la comptabilité au franc près, et c'est précisément le
 * document qu'on présente en cas de litige.
 *
 * ⚠️ **La commission n'y figure pas.** Le client paie le prix affiché ; la
 * part de la plateforme est prélevée sur celle du partenaire et ne le regarde
 * pas (guide §1). La faire apparaître sur son reçu reviendrait à lui montrer
 * des frais qu'il ne paie pas.
 */

export interface Receipt {
  id: string;
  reference: string;
  amount: number;
  currency: CurrencyCode;
  paidAt: string;
  /** Ce qui a été réservé, tel que figé sur la commande. */
  listingTitle: string | null;
  partnerName: string | null;
  orderReference: string | null;
  instalmentLabel: string | null;
  eventDate: string | null;
}

interface ReceiptRow {
  id: string;
  reference: string;
  amount: number;
  currency: string | null;
  paid_at: string | null;
  orders: {
    reference: string;
    listing_title: string | null;
    event_date: string | null;
    organizations: { legal_name: string; brand_name: string | null } | null;
  } | null;
  order_instalments: { label: string } | null;
}

const SELECT =
  "id, reference, amount, currency, paid_at, " +
  "orders(reference, listing_title, event_date, organizations(legal_name, brand_name)), " +
  "order_instalments(label)";

function toReceipt(row: ReceiptRow): Receipt {
  const org = row.orders?.organizations ?? null;

  return {
    id: row.id,
    reference: row.reference,
    amount: row.amount,
    currency: (row.currency as CurrencyCode) ?? "XOF",
    // `paid_at` est garanti non nul par le filtre sur `status = 'paid'` ; le
    // repli protège d'une ligne encaissée sans horodatage, qui serait un bug
    // en amont plutôt qu'une raison de masquer le reçu.
    paidAt: row.paid_at ?? "",
    listingTitle: row.orders?.listing_title ?? null,
    partnerName: org ? (org.brand_name ?? org.legal_name) : null,
    orderReference: row.orders?.reference ?? null,
    instalmentLabel: row.order_instalments?.label ?? null,
    eventDate: row.orders?.event_date ?? null,
  };
}

/**
 * Les reçus du client connecté.
 *
 * La RLS de `payments` fait le tri : un client ne voit que les paiements de
 * ses propres commandes. Aucun filtre applicatif sur l'identité, donc — en
 * ajouter un donnerait l'illusion que c'est lui qui protège.
 */
export async function getMyReceipts(): Promise<Receipt[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payments")
    .select(SELECT)
    .eq("status", "paid")
    .order("paid_at", { ascending: false });

  if (error) throw new Error(`Lecture des reçus impossible : ${error.message}`);

  return ((data ?? []) as unknown as ReceiptRow[]).map(toReceipt);
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payments")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "paid")
    .maybeSingle();

  return data ? toReceipt(data as unknown as ReceiptRow) : null;
}
