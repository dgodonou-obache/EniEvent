import { shell } from "./shell.ts";

/**
 * E-mails d'authentification.
 *
 * **Ceux-ci ne sont pas expédiés par notre code.** Supabase Auth les envoie
 * lui-même, depuis des gabarits qu'il garde dans sa propre configuration — d'où
 * `scripts/mails-auth.mjs`, qui pousse ce que ce module produit. Le dépôt reste
 * la source de vérité ; Supabase n'en détient qu'une copie.
 *
 * Ils passaient jusqu'ici par les gabarits par défaut de Supabase : **en
 * anglais, sans logo, un lien bleu souligné sur fond blanc**. C'est le tout
 * premier message que reçoit un utilisateur d'ÉniEvent, sur une plateforme
 * française destinée au Bénin.
 *
 * Deux différences avec les notifications, qui expliquent la forme :
 *
 * 1. **Les valeurs sont des marqueurs, pas des données.** `{{ .ConfirmationURL }}`
 *    est remplacé par Supabase au moment de l'envoi. Ils traversent `esc()`
 *    sans dommage — ils ne contiennent aucun caractère réservé — et c'est
 *    Supabase qui substitue ensuite, exactement comme dans ses propres gabarits.
 * 2. **Pas de variante texte.** Supabase n'expose qu'un seul champ par modèle :
 *    le HTML. La sortie `text` de `shell()` est donc inutilisée ici.
 *
 * La durée de validité annoncée dans les textes — une heure — doit rester
 * accordée à `mailer_otp_exp` côté Supabase. Un test le vérifie.
 */

/** Durée de validité d'un lien, en secondes. Doit valoir `mailer_otp_exp`. */
export const LIEN_VALIDITE_SECONDES = 3600;

/** Clés de la configuration Supabase, une paire par modèle. */
export interface AuthTemplate {
  /** Suffixe employé par `mailer_subjects_*` et `mailer_templates_*_content`. */
  key: string;
  /** Intitulé lisible, pour les journaux du script. */
  nom: string;
  subject: string;
  html: string;
}

function gabarit(
  key: string,
  nom: string,
  body: Parameters<typeof shell>[0],
): AuthTemplate {
  const { subject, html } = shell(body);
  return { key, nom, subject, html };
}

export const AUTH_TEMPLATES: readonly AuthTemplate[] = [
  gabarit("confirmation", "Confirmer l'inscription", {
    subject: "Confirmez votre adresse e-mail",
    preheader: "Une dernière étape pour activer votre compte ÉniEvent.",
    heading: "Plus qu'une étape",
    intro:
      "Bienvenue sur ÉniEvent. Confirmez votre adresse pour activer votre compte " +
      "et commencer à organiser votre événement.",
    cta: { label: "Confirmer mon adresse", href: "{{ .ConfirmationURL }}" },
    outro:
      "Ce lien est valable une heure. Si vous n'avez pas créé de compte sur " +
      "ÉniEvent, ignorez ce message : rien ne sera activé.",
  }),

  gabarit("recovery", "Réinitialiser le mot de passe", {
    subject: "Réinitialisez votre mot de passe",
    preheader: "Choisissez un nouveau mot de passe pour votre compte.",
    heading: "Choisissez un nouveau mot de passe",
    intro:
      "Vous avez demandé à réinitialiser votre mot de passe. Suivez le lien " +
      "ci-dessous pour en choisir un nouveau.",
    cta: { label: "Choisir un nouveau mot de passe", href: "{{ .ConfirmationURL }}" },
    // Rassurer explicitement : sans cette phrase, recevoir ce message sans
    // l'avoir demandé fait craindre que le compte soit déjà compromis.
    outro:
      "Ce lien est valable une heure et ne fonctionne qu'une fois. Si vous n'êtes " +
      "pas à l'origine de cette demande, ignorez ce message — votre mot de passe " +
      "actuel reste valable.",
  }),

  gabarit("magic_link", "Lien de connexion", {
    subject: "Votre lien de connexion",
    preheader: "Connectez-vous sans mot de passe.",
    heading: "Connectez-vous en un clic",
    intro: "Voici votre lien de connexion à ÉniEvent. Aucun mot de passe à saisir.",
    cta: { label: "Me connecter", href: "{{ .ConfirmationURL }}" },
    outro:
      "Ce lien est valable une heure et ne fonctionne qu'une fois. Ne le " +
      "transmettez à personne : il donne accès à votre compte.",
  }),

  gabarit("email_change", "Changer d'adresse", {
    subject: "Confirmez votre nouvelle adresse e-mail",
    preheader: "Le changement ne prendra effet qu'après confirmation.",
    heading: "Confirmez votre nouvelle adresse",
    intro:
      "Vous avez demandé à remplacer l'adresse avec laquelle vous vous connectez. " +
      "Confirmez la nouvelle pour que le changement prenne effet.",
    details: [
      ["Adresse actuelle", "{{ .Email }}"],
      ["Nouvelle adresse", "{{ .NewEmail }}"],
    ],
    cta: { label: "Confirmer le changement", href: "{{ .ConfirmationURL }}" },
    outro:
      "Tant que vous n'avez pas confirmé, votre adresse actuelle reste active. " +
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
  }),

  gabarit("invite", "Invitation", {
    subject: "Vous êtes invité sur ÉniEvent",
    preheader: "Acceptez l'invitation pour créer votre compte.",
    heading: "Vous êtes invité à rejoindre ÉniEvent",
    intro:
      "Quelqu'un vous a invité à rejoindre ÉniEvent. Acceptez l'invitation pour " +
      "créer votre compte et choisir votre mot de passe.",
    cta: { label: "Accepter l'invitation", href: "{{ .ConfirmationURL }}" },
    outro: "Si vous ne savez pas d'où vient cette invitation, ignorez ce message.",
  }),

  gabarit("reauthentication", "Ré-authentification", {
    // Le seul modèle sans lien : Supabase envoie un code à recopier. L'objet le
    // porte, pour qu'il se lise depuis la liste des messages sans ouvrir.
    subject: "{{ .Token }} — votre code de vérification ÉniEvent",
    preheader: "Saisissez ce code pour confirmer qu'il s'agit bien de vous.",
    heading: "Votre code de vérification",
    intro: "Saisissez ce code dans ÉniEvent pour confirmer qu'il s'agit bien de vous.",
    details: [["Code", "{{ .Token }}"]],
    outro:
      "Ce code est valable une heure. Ne le communiquez à personne — l'équipe " +
      "ÉniEvent ne vous le demandera jamais.",
  }),
];
