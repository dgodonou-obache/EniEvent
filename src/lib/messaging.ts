import "server-only";

import { createClient } from "@/utils/supabase/server";

import type { Database } from "@/types/database";

/**
 * Messagerie, côté lecture.
 *
 * **Rien ne lit `messages` directement**, et c'est le point central : la table
 * n'a aucun `grant` pour `authenticated`. Le corps brut ne sort de la base que
 * par `read_conversation`, qui le masque selon le lecteur et selon le seuil
 * atteint (migration 0037). Un module qui interrogerait la table contournerait
 * le masquage en une requête — c'est exactement ce qu'on s'interdit.
 *
 * `my_conversations` nomme déjà l'interlocuteur selon le même seuil : ce module
 * ne décide de rien, il présente.
 */

export type MessageSide = Database["public"]["Enums"]["message_side"];

export interface ConversationSummary {
  id: string;
  reference: string;
  /** Le côté depuis lequel l'appelant lit ce fil. */
  side: MessageSide;
  /** « Saveurs du Bénin », ou « Le client » tant que rien n'engage les deux. */
  counterpart: string;
  listingId: string | null;
  listingTitle: string | null;
  requestId: string | null;
  requestReference: string | null;
  lastMessageAt: string | null;
  unread: number;
  /** Vrai une fois un règlement encaissé : plus rien n'est masqué. */
  unmasked: boolean;
}

export interface MessageView {
  id: string;
  side: MessageSide;
  /** Vrai si l'appelant est du même côté que l'expéditeur. */
  mine: boolean;
  /** Déjà masqué si besoin : ce module ne masque rien lui-même. */
  body: string;
  createdAt: string;
}

/**
 * Fils de l'appelant **du côté demandé**, le plus récent d'abord.
 *
 * ⚠️ `my_conversations` rend les deux côtés à la fois : un partenaire qui
 * réserve aussi pour lui-même est client de certains fils et prestataire
 * d'autres. Sans le côté, `/compte/messages` mêlait les conversations de son
 * entreprise avec ses clients à ses propres échanges de client. Chaque espace
 * dit donc lequel il montre ; sans côté, on rend les deux (usage interne :
 * retrouver un fil précis, compter les non-lus).
 */
export async function getMyConversations(side?: MessageSide): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_conversations");

  return ((data ?? []) as {
    id: string;
    reference: string;
    side: MessageSide;
    counterpart: string | null;
    listing_id: string | null;
    listing_title: string | null;
    request_id: string | null;
    request_reference: string | null;
    last_message_at: string | null;
    unread: number;
    unmasked: boolean;
  }[]).map((c) => ({
    id: c.id,
    reference: c.reference,
    side: c.side,
    counterpart: c.counterpart ?? "Conversation",
    listingId: c.listing_id,
    listingTitle: c.listing_title,
    requestId: c.request_id,
    requestReference: c.request_reference,
    lastMessageAt: c.last_message_at,
    unread: c.unread,
    unmasked: c.unmasked,
  })).filter((c) => !side || c.side === side);
}

/** Un fil précis, avec ses messages. `null` si l'appelant n'y a pas accès. */
export async function getConversation(
  id: string,
): Promise<{ summary: ConversationSummary; messages: MessageView[] } | null> {
  const supabase = await createClient();

  const [conversations, { data: messages, error }] = await Promise.all([
    getMyConversations(),
    supabase.rpc("read_conversation", { conversation: id }),
  ]);

  const summary = conversations.find((c) => c.id === id);

  // `read_conversation` lève pour un fil qui n'est pas ouvert à l'appelant :
  // on rend `null` plutôt que de laisser remonter l'erreur, l'écran répondant
  // par un 404 — qui ne révèle pas l'existence du fil.
  if (!summary || error) return null;

  return {
    summary,
    messages: ((messages ?? []) as {
      id: string;
      sender_side: MessageSide;
      mine: boolean;
      body: string;
      created_at: string;
    }[]).map((m) => ({
      id: m.id,
      side: m.sender_side,
      mine: m.mine,
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

/** Nombre total de messages non lus, pour une pastille de menu. */
export async function getUnreadCount(): Promise<number> {
  const conversations = await getMyConversations();
  return conversations.reduce((total, c) => total + c.unread, 0);
}
