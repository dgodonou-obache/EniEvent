import Link from "next/link";

import { Article, LegalPage } from "@/components/legal/LegalPage";
import { ENTITY, PROCESSORS } from "@/lib/legal";

/**
 * Politique de confidentialité.
 *
 * **Décrit ce que le code collecte, pas ce qu'un modèle suppose.** Les durées
 * de session (14 jours, 1 heure sur l'administration) viennent de
 * `src/lib/auth/inactivity.ts` ; la liste des sous-traitants de
 * `src/lib/legal.ts`, elle-même vérifiée contre la configuration réelle.
 * Annoncer une collecte qui n'existe pas est aussi fautif que taire celle qui
 * existe.
 */

export const metadata = {
  title: "Politique de confidentialité",
  description: "Quelles données ÉniEvent collecte, pourquoi, et comment les faire supprimer.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Ce que nous collectons, pourquoi, avec qui nous le partageons, et comment reprendre la main."
    >
      <Article title="1. Qui traite vos données">
        <p>
          {ENTITY.legalName}, dont les coordonnées figurent dans les{" "}
          <Link href="/mentions-legales" className="font-semibold text-orange-600">
            mentions légales
          </Link>
          . Pour toute question, écrivez à <strong>{ENTITY.email}</strong>.
        </p>
      </Article>

      <Article title="2. Ce que nous collectons">
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Votre compte</strong> — nom, adresse électronique, téléphone, ville, type
            de compte. Le mot de passe n&apos;est jamais conservé en clair : il est haché par
            notre prestataire d&apos;authentification, et nous ne pouvons pas le lire.
          </li>
          <li>
            <strong>Votre activité</strong> — demandes de devis, réservations, échéanciers,
            règlements, annulations, remboursements.
          </li>
          <li>
            <strong>Vos messages</strong> — les échanges avec vos prestataires ou vos clients.
          </li>
          <li>
            <strong>Pour un prestataire</strong> — informations d&apos;entreprise, annonces,
            photographies, pièces justificatives, coordonnées de versement.
          </li>
          <li>
            <strong>Des traces techniques</strong> — journaux de connexion et
            d&apos;opérations sensibles, conservés pour la sécurité et la preuve.
          </li>
        </ul>
        <p>
          <strong>Nous ne collectons aucune donnée bancaire.</strong> Les paiements
          s&apos;effectuent chez FedaPay ; ni votre numéro de carte, ni votre code Mobile Money
          ne transitent par nos serveurs.
        </p>
      </Article>

      <Article title="3. Pourquoi">
        <ul className="ml-4 list-disc space-y-1">
          <li>Tenir votre compte et vous donner accès à votre espace.</li>
          <li>
            Exécuter ce que vous demandez : transmettre une demande, permettre une
            réservation, encaisser un règlement, verser un remboursement.
          </li>
          <li>
            Vous prévenir par courriel de ce qui appelle une réponse de votre part — une
            demande reçue, un devis, un message, une annulation.
          </li>
          <li>Détecter les abus, et conserver la preuve des opérations financières.</li>
        </ul>
        <p>
          <strong>Nous n&apos;envoyons pas de publicité</strong> et ne vendons aucune donnée.
        </p>
      </Article>

      <Article title="4. Ce que voient les autres">
        <p>
          Quand vous déposez une demande de devis, les prestataires concernés en reçoivent le
          contenu — ville, date, nombre d&apos;invités, budget, description — mais{" "}
          <strong>pas votre identité</strong>. Votre nom ne leur est révélé qu&apos;une fois
          une commande passée avec eux.
        </p>
        <p>
          Dans la messagerie, numéros et adresses restent masqués tant qu&apos;aucun règlement
          n&apos;a été encaissé.
        </p>
        <p>
          Un prestataire ne voit jamais les propositions de ses concurrents, ni la liste des
          prestataires sollicités.
        </p>
      </Article>

      <Article title="5. Où vos données sont conservées">
        <p>
          La base de données et les comptes sont hébergés <strong>à Paris, en France</strong>.
          L&apos;application s&apos;exécute également depuis Paris. Nos intervenants :
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.role}. {p.location}.{" "}
              <a
                href={p.site}
                className="text-orange-600 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Leur politique
              </a>
            </li>
          ))}
        </ul>
        <p>
          L&apos;envoi de nos courriels passe par un prestataire établi aux États-Unis : les
          adresses de destination et le contenu des messages y transitent.
        </p>
      </Article>

      <Article title="6. Combien de temps">
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Votre compte</strong> — tant qu&apos;il est ouvert, puis douze mois après
            sa fermeture.
          </li>
          <li>
            <strong>Réservations et règlements</strong> — dix ans, durée de conservation des
            pièces comptables.
          </li>
          <li>
            <strong>Messages</strong> — trois ans après le dernier échange.
          </li>
          <li>
            <strong>Journaux techniques</strong> — douze mois.
          </li>
        </ul>
      </Article>

      <Article title="7. Vos droits">
        <p>
          Vous pouvez consulter, corriger ou faire supprimer vos données, vous opposer à un
          traitement, et en demander une copie. Écrivez à <strong>{ENTITY.email}</strong> :
          nous répondons sous un mois.
        </p>
        <p>
          Une suppression ne peut pas effacer ce qui doit être conservé pour des raisons
          comptables ou probatoires — une réservation réglée, par exemple. Nous vous dirons
          alors précisément ce qui reste, et pourquoi.
        </p>
        <p>
          Au Bénin, vous pouvez saisir l&apos;
          <strong>Autorité de Protection des Données à Caractère Personnel (APDP)</strong>.
        </p>
      </Article>

      <Article title="8. Cookies et sessions">
        <p>
          Nous n&apos;employons <strong>aucun cookie publicitaire ni de mesure d&apos;audience
          tierce</strong>. Seul un cookie de session, indispensable, vous maintient connecté.
        </p>
        <p>
          Une session expire après <strong>quatorze jours</strong> sans activité, et après{" "}
          <strong>une heure</strong> dans l&apos;espace d&apos;administration.
        </p>
      </Article>

      <Article title="9. Sécurité">
        <p>
          Les échanges sont chiffrés. L&apos;accès aux données est cloisonné au niveau de la
          base elle-même : un compte ne peut lire que ce qui le concerne, indépendamment de ce
          que l&apos;interface affiche. Les opérations sensibles sont journalisées.
        </p>
        <p>
          Aucun système n&apos;est infaillible. En cas de violation susceptible de vous
          exposer, nous vous préviendrions sans délai.
        </p>
      </Article>
    </LegalPage>
  );
}
