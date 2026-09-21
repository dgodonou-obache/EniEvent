import { MessageComposer } from "@/components/messaging/MessageComposer";
import type { ConversationSummary, MessageView } from "@/lib/messaging";

/**
 * Un fil de discussion.
 *
 * **Le texte est interpolé en JSX et rendu avec `whitespace-pre-line`**, comme
 * `quotes.message` partout ailleurs dans le dépôt : les retours à la ligne
 * viennent du CSS, jamais d'un `<br>` injecté. C'est ce qui permet de garder
 * l'échappement de React intact sur du texte écrit par un inconnu — il n'y a
 * aucun `dangerouslySetInnerHTML` dans ce dépôt, et il ne doit pas y en avoir
 * un premier ici.
 *
 * Le corps arrive **déjà masqué** de `read_conversation` : ce composant ne
 * décide de rien et n'a aucun moyen de démasquer quoi que ce soit.
 */

interface Props {
  summary: ConversationSummary;
  messages: readonly MessageView[];
  /** Vrai une fois l'acompte encaissé. */
  unmasked: boolean;
}

const HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function quand(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : HORODATAGE.format(d);
}

export function MessageThread({ summary, messages, unmasked }: Props) {
  return (
    <div>
      {messages.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {summary.side === "partner"
            ? "Posez votre question : le client en sera prévenu par courriel."
            : "Écrivez votre première question — le prestataire en sera prévenu par courriel."}
        </p>
      ) : (
        <ol className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${
                  m.mine
                    ? "bg-orange-50 text-slate-900"
                    : "border border-slate-100 bg-white text-slate-900"
                }`}
              >
                <p className="whitespace-pre-line text-sm leading-relaxed">{m.body}</p>
                <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {quand(m.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Dit une fois, sous le fil, plutôt qu'à chaque message masqué : répété,
          l'avertissement devient du bruit et cesse d'être lu. */}
      {!unmasked ? (
        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          Numéros et adresses restent masqués jusqu&apos;au premier règlement. Ils
          s&apos;afficheront tous les deux automatiquement une fois la réservation payée —
          vous n&apos;aurez rien à renvoyer.
        </p>
      ) : null}

      <MessageComposer conversationId={summary.id} unmasked={unmasked} />
    </div>
  );
}
