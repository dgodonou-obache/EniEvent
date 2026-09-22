/**
 * Lecture du résultat d'une inscription ou d'une connexion.
 *
 * **Cette logique est isolée ici parce qu'elle est contre-intuitive.**
 * `supabase.auth.signUp` ne renvoie **aucune erreur** quand l'adresse est déjà
 * prise : il rend un utilisateur d'apparence normale, dont la liste
 * `identities` est simplement **vide**. C'est une mesure anti-énumération de
 * Supabase — et c'est précisément ce qui a laissé un partenaire tourner en
 * rond : il se réinscrivait, lisait « Vérifiez votre boîte mail », et rien
 * n'arrivait puisque aucun compte n'était créé.
 *
 * ⚠️ **Signaler l'adresse déjà prise rend l'énumération possible.** C'est un
 * choix assumé de l'exploitant : sans ce message, un utilisateur bloqué n'a
 * aucun moyen de comprendre ce qui lui arrive, et la place de marché perd un
 * partenaire pour une raison qu'il ne saura jamais nommer.
 *
 * La connexion, elle, ne perd rien : `email_not_confirmed` n'est rendu par
 * Supabase que lorsque **le mot de passe est correct**. Le dire n'apprend donc
 * rien à qui ne le connaît pas déjà — contrairement au message d'inscription.
 */

export type SignUpOutcome =
  /** Compte créé, session ouverte : la confirmation n'est pas exigée. */
  | { kind: "connecte" }
  /** Compte créé, en attente du lien de confirmation. */
  | { kind: "confirmation-attendue"; email: string }
  /** L'adresse a déjà un compte. */
  | { kind: "deja-inscrit"; email: string }
  | { kind: "echec"; message: string };

interface SignUpReply {
  error?: { message?: string; code?: string } | null;
  user?: { identities?: unknown[] | null } | null;
  session?: unknown | null;
}

export function describeSignUp(reply: SignUpReply, email: string): SignUpOutcome {
  if (reply.error) {
    // Chemin emprunté quand la confirmation d'e-mail est désactivée : Supabase
    // rend alors une vraie erreur plutôt que la réponse obscurcie.
    const brut = (reply.error.message ?? "").toLowerCase();
    if (reply.error.code === "user_already_exists" || brut.includes("already")) {
      return { kind: "deja-inscrit", email };
    }

    return { kind: "echec", message: "La création du compte a échoué. Réessayez dans un instant." };
  }

  // **Le cas qui manquait.** Un utilisateur rendu sans aucune identité n'a pas
  // été créé : l'adresse appartient déjà à quelqu'un.
  if (reply.user && (reply.user.identities?.length ?? 0) === 0) {
    return { kind: "deja-inscrit", email };
  }

  if (!reply.session) {
    return { kind: "confirmation-attendue", email };
  }

  return { kind: "connecte" };
}

export type SignInOutcome =
  | { kind: "connecte" }
  /** Le mot de passe est bon, mais l'adresse n'a jamais été confirmée. */
  | { kind: "adresse-non-confirmee" }
  | { kind: "refuse" };

interface SignInReply {
  error?: { message?: string; code?: string } | null;
}

export function describeSignIn(reply: SignInReply): SignInOutcome {
  if (!reply.error) return { kind: "connecte" };

  const brut = (reply.error.message ?? "").toLowerCase();

  // Supabase ne rend `email_not_confirmed` **que** si le mot de passe est juste.
  // Le distinguer ne révèle donc rien à qui ne l'a pas déjà. Pour tout le
  // reste, un message unique : séparer « adresse inconnue » de « mot de passe
  // faux » dirait quels comptes existent.
  if (reply.error.code === "email_not_confirmed" || brut.includes("not confirmed")) {
    return { kind: "adresse-non-confirmee" };
  }

  return { kind: "refuse" };
}
