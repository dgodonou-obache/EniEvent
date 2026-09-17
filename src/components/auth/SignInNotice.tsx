import { Clock, MailWarning } from "lucide-react";

/**
 * Pourquoi l'utilisateur se retrouve sur la page de connexion.
 *
 * Trois chemins y mènent sans qu'il l'ait demandé : une session expirée par
 * inactivité, un lien de confirmation périmé, un lien déjà utilisé. Sans un
 * mot, ces retours ressemblent à une panne — et la règle §5 de `CLAUDE.md`
 * demande de dire les choses en clair.
 */

const MESSAGES = {
  inactivite: {
    icon: Clock,
    titre: "Votre session a expiré",
    texte: "Vous êtes resté un moment sans revenir. Reconnectez-vous pour continuer.",
  },
  "lien-expire": {
    icon: MailWarning,
    titre: "Ce lien n'est plus valable",
    texte: "Les liens de confirmation ont une durée limitée. Connectez-vous, ou demandez-en un nouveau.",
  },
  "lien-invalide": {
    icon: MailWarning,
    titre: "Ce lien n'a pas pu être lu",
    texte: "Il a peut-être déjà servi, ou été coupé par votre messagerie. Connectez-vous normalement.",
  },
} as const;

export type NoticeKey = keyof typeof MESSAGES;

export function SignInNotice({ raison, erreur }: { raison?: string; erreur?: string }) {
  const cle = (raison ?? erreur) as NoticeKey | undefined;
  const message = cle && cle in MESSAGES ? MESSAGES[cle] : null;

  if (!message) return null;

  const Icon = message.icon;

  return (
    <div
      role="status"
      className="mt-4 flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p className="text-sm font-medium text-amber-900">{message.titre}</p>
        <p className="mt-0.5 text-sm text-amber-800">{message.texte}</p>
      </div>
    </div>
  );
}
