import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import { envoyer } from "./lib/smtp.mjs";

/**
 * Accorde les droits d'administration à une adresse.
 *
 *   npm run admin:creer -- backofficevent@enievent.com "Back-office ÉniEvent"
 *
 * **Pourquoi un script et pas un écran.** Le premier administrateur ne peut pas
 * être créé depuis le back-office — il faudrait déjà y être. Les suivants le
 * seront, quand l'écran existera ; celui-ci restera pour le tout premier et
 * pour les cas de reprise.
 *
 * **Le mot de passe ne s'affiche pas.** Il part par courrier vers l'adresse
 * concernée : un secret lu dans un terminal se retrouve dans un historique, une
 * capture d'écran ou une conversation. Le refus du serveur au moment du
 * `RCPT TO` prouve au passage que la boîte existe.
 *
 * Le type de compte est posé **après** la création : `app.handle_new_user`
 * refuse délibérément un `account_type` « admin » demandé par le client, et ce
 * garde-fou ne doit pas être contourné par une inscription déguisée.
 */

const [, , email, nom] = process.argv;

if (!email || !email.includes("@")) {
  console.error('Usage : npm run admin:creer -- <email> "<nom affiché>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://enievent.com";

if (!url || !secret) {
  console.error("Variables manquantes. Lancez avec --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

// 18 octets : long, mais recopiable à la main depuis un téléphone.
const motDePasse = randomBytes(18).toString("base64url");

const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existant = liste.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

let userId;

if (existant) {
  userId = existant.id;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: motDePasse,
    email_confirm: true,
  });
  if (error) {
    console.error("Mise à jour impossible :", error.message);
    process.exit(1);
  }
  console.log(`Compte existant réutilisé : ${email}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    // Confirmé d'office : le premier administrateur ne doit pas dépendre d'un
    // courrier pour entrer, sinon une panne d'envoi le laisse dehors.
    email_confirm: true,
    user_metadata: { full_name: nom ?? "Administration ÉniEvent" },
  });
  if (error) {
    console.error("Création impossible :", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Compte créé : ${email}`);
}

const { error: promotion } = await admin
  .from("profiles")
  .update({ account_type: "admin", full_name: nom ?? "Administration ÉniEvent" })
  .eq("id", userId);

if (promotion) {
  console.error("Promotion impossible :", promotion.message);
  process.exit(1);
}

const { data: verif } = await admin
  .from("profiles")
  .select("account_type, full_name")
  .eq("id", userId)
  .single();

console.log(`Type de compte : ${verif?.account_type} — ${verif?.full_name}`);

if (verif?.account_type !== "admin") {
  console.error("Le profil n'est pas passé en admin. Interruption.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
const mailUser = process.env.MAIL_USER;
const mailPass = process.env.MAIL_PASS;

const texte = [
  "Votre accès au back-office ÉniEvent a été créé.",
  "",
  `Adresse   : ${site}/admin/connexion`,
  `Identifiant : ${email}`,
  `Mot de passe : ${motDePasse}`,
  "",
  "Ce mot de passe a été engendré au hasard et n'est conservé nulle part :",
  "ni dans le dépôt, ni dans un fichier de configuration. Ce courrier est le",
  "seul endroit où il figure — mettez-le à l'abri, puis supprimez le message.",
  "",
  "Un compte d'administration ne se crée pas depuis le site : il est accordé.",
].join("\n");

if (!mailUser || !mailPass) {
  console.log("\nMAIL_USER / MAIL_PASS absentes : envoi impossible.");
  console.log("Mot de passe (à transmettre par un canal sûr, puis à effacer) :");
  console.log(`\n  ${motDePasse}\n`);
  process.exit(0);
}

try {
  await envoyer({
    user: mailUser,
    pass: mailPass,
    from: mailUser,
    to: email,
    sujet: "Votre accès au back-office ÉniEvent",
    texte,
  });
  console.log(`\nIdentifiants envoyés à ${email}. Ils n'apparaissent nulle part ailleurs.`);
} catch (e) {
  console.error(`\nEnvoi impossible : ${e.message}`);
  console.error("Le compte est créé mais son mot de passe n'a été transmis à personne.");
  console.error("Relancez la commande une fois la boîte joignable — elle réutilisera le compte.");
  process.exit(1);
}
