import { ConversationList } from "@/components/messaging/ConversationList";
import { requireUser } from "@/lib/auth/session";
import { getMyConversations } from "@/lib/messaging";

/**
 * Messages du particulier.
 *
 * Un fil par prestataire, quel que soit ce qui l'a ouvert : une question sur
 * une annonce, un appel d'offres, une réservation en cours. C'est ce qui garde
 * l'historique d'un bout à l'autre de la relation plutôt que de l'éparpiller
 * en autant de conversations que d'occasions.
 */

export const metadata = { title: "Messages" };

export default async function AccountMessagesPage() {
  await requireUser();

  const conversations = await getMyConversations("client");
  const nonLus = conversations.reduce((total, c) => total + c.unread, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">
          {conversations.length === 0
            ? "Vous n'avez encore écrit à aucun prestataire."
            : nonLus > 0
              ? `${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}`
              : `${conversations.length} conversation${conversations.length > 1 ? "s" : ""}`}
        </p>
      </div>

      <ConversationList
        conversations={conversations}
        base="/compte/messages"
        emptyDescription="Ouvrez une fiche et posez votre question au prestataire : c'est souvent le plus rapide pour savoir si un lieu convient."
      />
    </div>
  );
}
