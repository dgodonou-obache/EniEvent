import { ConversationList } from "@/components/messaging/ConversationList";
import { requireSpace } from "@/lib/auth/session";
import { getMyConversations } from "@/lib/messaging";

/**
 * Messages de l'entreprise.
 *
 * **Les fils de toute l'équipe, pas seulement les siens.** Même raison que pour
 * `/entreprise/projets` : un collègue qui reprend un dossier — congés, départ —
 * doit retrouver l'échange complet avec le prestataire. C'est `client_org_id`
 * sur la conversation qui le permet, copie du motif de `quote_requests`.
 *
 * Cet écran n'existait pas dans le menu de l'espace entreprise, alors qu'une
 * entreprise est un client qui lance des appels d'offres — et que les espaces
 * sont étanches, donc impossible de la renvoyer vers `/compte`.
 */

export const metadata = { title: "Messages" };

export default async function CompanyMessagesPage() {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const conversations = await getMyConversations("client");
  const nonLus = conversations.reduce((total, c) => total + c.unread, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">
          {conversations.length === 0
            ? "Aucune conversation pour l'instant."
            : nonLus > 0
              ? `${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}`
              : `${conversations.length} conversation${conversations.length > 1 ? "s" : ""}`}
        </p>
      </div>

      <ConversationList
        conversations={conversations}
        base="/entreprise/messages"
        emptyDescription="Les échanges avec vos prestataires apparaîtront ici, visibles par toute l'équipe : un dossier repris ne repart pas de zéro."
      />
    </div>
  );
}
