import tls from "node:tls";

/**
 * Envoi SMTP minimal, en dialogue direct.
 *
 * Pourquoi pas une bibliothèque : ce module ne sert qu'à transmettre des
 * identifiants d'administration à une boîte du domaine. Une dépendance de plus
 * pour cinq commandes SMTP serait une surface d'attaque gratuite, sur le seul
 * chemin du dépôt qui manipule un mot de passe en clair.
 *
 * Les réponses sont lues **une par une** : écrire la commande suivante sans
 * attendre la précédente donne un dialogue désynchronisé, et des erreurs qui
 * semblent venir d'ailleurs.
 */
export async function envoyer({ host = "ssl0.ovh.net", port = 465, user, pass, from, to, sujet, texte }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    let tampon = "";
    let attente = null;

    const fin = (erreur, valeur) => {
      try { socket.destroy(); } catch {}
      if (erreur) reject(erreur);
      else resolve(valeur);
    };

    socket.setTimeout(20000, () => fin(new Error("délai SMTP dépassé")));
    socket.on("error", (e) => fin(e));

    socket.on("data", (chunk) => {
      tampon += chunk.toString();
      const m = tampon.match(/^(?:\d{3}-.*\r\n)*(\d{3}) [^\r\n]*\r\n$/);
      if (!m || !attente) return;
      const reponse = { code: m[1], texte: tampon.trim().split("\n").pop().trim() };
      tampon = "";
      const suite = attente;
      attente = null;
      suite(reponse);
    });

    const dire = (commande) =>
      new Promise((res) => {
        attente = res;
        if (commande !== null) socket.write(commande + "\r\n");
      });

    const exiger = async (commande, attendu, quoi) => {
      const r = await dire(commande);
      if (!String(r.code).startsWith(attendu)) throw new Error(`${quoi} : ${r.texte}`);
      return r;
    };

    (async () => {
      try {
        await exiger(null, "2", "accueil du serveur");
        await exiger("EHLO enievent.com", "2", "EHLO");
        await exiger("AUTH LOGIN", "3", "AUTH LOGIN");
        await exiger(Buffer.from(user).toString("base64"), "3", "identifiant");
        await exiger(Buffer.from(pass).toString("base64"), "2", "mot de passe refusé");
        await exiger(`MAIL FROM:<${from}>`, "2", "expéditeur refusé");

        // Le point le plus instructif : un 550 ici signifie que la boîte
        // destinataire n'existe pas. On le remonte tel quel.
        await exiger(`RCPT TO:<${to}>`, "2", `destinataire refusé (${to} existe-t-elle ?)`);

        await exiger("DATA", "3", "DATA");

        const corps = [
          `From: ÉniEvent <${from}>`,
          `To: <${to}>`,
          `Subject: =?UTF-8?B?${Buffer.from(sujet).toString("base64")}?=`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          Buffer.from(texte).toString("base64").replace(/(.{76})/g, "$1\r\n"),
          ".",
        ].join("\r\n");

        await exiger(corps, "2", "message refusé");
        await dire("QUIT");
        fin(null, true);
      } catch (e) {
        fin(e);
      }
    })();
  });
}
