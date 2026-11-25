import { ConversationList } from "@/components/messaging/ConversationList";
import { requireSpace } from "@/lib/auth/session";
import { getMyConversations } from "@/lib/messaging";

/**
 * Messages du prestataire.
 *
 * **Le client n'est nommé qu'une fois une commande passée.** Avant cela, la
 * liste affiche « Le client » — c'est l'anonymat de l'appel d'offres, déjà tenu
 * par `/pro/demandes`, qui ne remonte ni nom ni téléphone. Une messagerie qui
 * le romprait annulerait la loyauté de la mise en concurrence.
 */

export const metadata = { title: "Messages" };

export default async function PartnerMessagesPage() {
  const { decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted || !decision.org) return null;

  const conversations = await getMyConversations("partner");
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
        base="/pro/messages"
        emptyDescription="Une demande vous manque d'informations ? Ouvrez-la dans « Demandes reçues » et posez votre question avant de chiffrer — un devis hors sujet ne se rattrape pas."
      />
    </div>
  );
}
