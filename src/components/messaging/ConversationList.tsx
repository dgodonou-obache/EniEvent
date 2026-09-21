import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { ConversationSummary } from "@/lib/messaging";

/**
 * Boîte de réception, partagée par les trois espaces.
 *
 * Le seul paramètre qui change est la **racine** : les espaces sont étanches
 * (§4 du guide), un client d'entreprise ne doit jamais aboutir sur `/compte`.
 * On passe donc une chaîne, jamais une fonction — rien ne traverse la frontière
 * serveur → client ici, mais la règle vaut d'être tenue partout.
 *
 * Les fils non lus passent devant leur date : c'est ce qui appelle une action.
 */

interface Props {
  conversations: readonly ConversationSummary[];
  /** « /compte/messages », « /pro/messages » ou « /entreprise/messages ». */
  base: string;
  /** Ce que dit l'écran vide, qui n'est pas le même des deux côtés. */
  emptyDescription: string;
}

const QUAND = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function quand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : QUAND.format(d);
}

export function ConversationList({ conversations, base, emptyDescription }: Props) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Aucune conversation"
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {conversations.map((c) => {
        const contexte = c.listingTitle ?? c.requestReference ?? null;

        return (
          <li key={c.id}>
            <Link
              href={`${base}/${c.id}`}
              className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="truncate">{c.counterpart}</span>
                  {c.unread > 0 ? (
                    <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  ) : null}
                </p>
                {contexte ? (
                  <p className="mt-0.5 truncate text-xs text-slate-500">{contexte}</p>
                ) : null}
              </div>

              <span className="shrink-0 text-xs text-slate-400">{quand(c.lastMessageAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
