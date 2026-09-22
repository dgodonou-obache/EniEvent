import Link from "next/link";

import { Article, LegalPage } from "@/components/legal/LegalPage";
import { ENTITY } from "@/lib/legal";

/**
 * Conditions générales d'utilisation et de vente.
 *
 * **Écrites d'après ce que le code fait, pas d'après un modèle.** Chaque règle
 * énoncée ici correspond à un comportement vérifiable : le prix affiché est
 * celui débité (migration 0034), le barème d'annulation est figé à la
 * réservation (0032), le versement au prestataire attend la prestation (0032).
 * Promettre autre chose créerait l'écart que les litiges viennent chercher.
 */

export const metadata = {
  title: "Conditions générales",
  description:
    "Comment fonctionne ÉniEvent : réservation, paiement, annulation et remboursement.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Conditions générales d'utilisation et de vente"
      intro="Ce que vous pouvez attendre d'ÉniEvent, et ce que nous attendons de vous. Nous avons écrit ce texte pour qu'il se lise."
    >
      <Article title="1. Le rôle d'ÉniEvent">
        <p>
          ÉniEvent met en relation des <strong>clients</strong> et des{" "}
          <strong>prestataires</strong> événementiels au Bénin. Nous ne louons aucune salle et
          ne servons aucun repas.
        </p>
        <p>
          <strong>Le contrat se conclut entre vous et le prestataire.</strong> ÉniEvent en
          facilite la formation, encaisse le règlement pour le compte du prestataire, et le
          lui reverse sa commission déduite. Nous ne sommes pas partie à la prestation et
          n&apos;en garantissons pas l&apos;exécution.
        </p>
      </Article>

      <Article title="2. Compte et inscription">
        <p>
          L&apos;inscription est gratuite et réservée aux personnes majeures. Une adresse
          électronique ne peut servir qu&apos;une fois, quel que soit l&apos;espace — client,
          partenaire ou entreprise. Elle doit être confirmée avant la première connexion.
        </p>
        <p>
          Vous répondez de l&apos;exactitude des informations fournies et de la
          confidentialité de votre mot de passe. Un prestataire garantit être régulièrement
          établi et en règle avec ses obligations.
        </p>
      </Article>

      <Article title="3. Prix : ce qui est affiché est ce qui est payé">
        <p>
          <strong>Aucun frais n&apos;est ajouté au client.</strong> Le montant affiché sur une
          annonce est celui qui sera débité — pas de frais de dossier, pas de supplément de
          service, pas de majoration de dernière minute.
        </p>
        <p>
          ÉniEvent se rémunère par une <strong>commission prélevée sur le prestataire</strong>,
          au moment de l&apos;encaissement. Elle est convenue avec lui et n&apos;augmente
          jamais le prix payé par le client.
        </p>
        <p>Les prix sont exprimés en francs CFA (XOF), toutes taxes comprises.</p>
      </Article>

      <Article title="4. Réserver">
        <p>Deux chemins, selon la prestation :</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>La réservation immédiate</strong> — vous choisissez vos dates, le prix se
            calcule, la réservation est faite.
          </li>
          <li>
            <strong>La demande de devis</strong> — vous décrivez votre besoin, plusieurs
            prestataires vous répondent, vous comparez et retenez celui de votre choix.
          </li>
        </ul>
        <p>
          Dans les deux cas, les dates sont <strong>retenues dès la réservation</strong>, avant
          même le règlement. Une réservation laissée sans paiement libère ses dates au bout de
          trente minutes : elles redeviennent disponibles pour d&apos;autres.
        </p>
      </Article>

      <Article title="5. Payer">
        <p>
          Les règlements passent par <strong>FedaPay</strong> : Mobile Money (MTN MoMo, Moov
          Money, Celtiis Cash) ou carte bancaire. Le paiement s&apos;effectue sur la page
          sécurisée de ce prestataire ; <strong>ÉniEvent ne voit jamais</strong> vos
          identifiants de paiement ni votre code.
        </p>
        <p>
          Chaque prestataire fixe ses <strong>conditions de règlement</strong> : un acompte à
          la réservation, puis le solde avant la prestation, selon un échéancier affiché
          <strong> avant</strong> que vous ne vous engagiez. Les échéances se règlent dans
          l&apos;ordre.
        </p>
      </Article>

      <Article title="6. Annuler et se faire rembourser">
        <p>
          Chaque annonce porte un <strong>barème d&apos;annulation</strong>, affiché sur la
          fiche et rappelé avant que vous ne confirmiez. Ce barème est{" "}
          <strong>figé au moment de la réservation</strong> : si le prestataire durcit ses
          conditions ensuite, celles de votre réservation ne bougent pas.
        </p>
        <p>
          Le remboursement porte sur <strong>ce que vous avez réellement versé</strong>. Ce qui
          reste acquis au prestataire est calculé sur le montant total, puis plafonné à la
          somme encaissée : <strong>ÉniEvent ne vous réclamera jamais de complément</strong>{" "}
          après une annulation.
        </p>
        <p>
          <strong>Si c&apos;est le prestataire qui se désiste, vous êtes intégralement
          remboursé</strong>, quel que soit son barème. Celui-ci le protège d&apos;un
          changement d&apos;avis de votre part, pas de sa propre défaillance.
        </p>
        <p>
          Une prestation déjà rendue ne s&apos;annule plus. Les remboursements sont versés
          sous quelques jours ouvrés, sur le moyen de paiement utilisé ou par Mobile Money.
        </p>
      </Article>

      <Article title="7. Ce qui revient au prestataire">
        <p>
          La part du prestataire lui est versée <strong>après la prestation</strong>, commission
          déduite. Tant que la date n&apos;est pas passée, le client peut encore annuler :
          verser plus tôt reviendrait à redemander l&apos;argent ensuite.
        </p>
        <p>
          Une réservation annulée libère immédiatement ce qui reste acquis au prestataire :
          l&apos;annulation étant définitive, plus rien ne viendra après.
        </p>
      </Article>

      <Article title="8. Messages entre clients et prestataires">
        <p>
          La messagerie sert à préparer la prestation. Tant qu&apos;aucun règlement n&apos;a
          été encaissé, les <strong>numéros de téléphone et adresses électroniques y sont
          masqués</strong> : ils s&apos;affichent automatiquement dès le premier paiement, sans
          que vous ayez à les renvoyer.
        </p>
        <p>
          Contourner ce dispositif pour conclure hors de la plateforme prive le prestataire de
          la protection qu&apos;elle apporte — traçabilité du règlement, barème d&apos;annulation
          opposable, recours en cas de litige — et peut entraîner la fermeture du compte.
        </p>
      </Article>

      <Article title="9. Ce que nous pouvons refuser">
        <p>
          Une annonce est publiée après validation. Nous pouvons refuser ou retirer une annonce
          trompeuse, illicite, ou dont le prix ne correspond manifestement pas à la prestation,
          et suspendre un compte en cas de manquement grave ou répété.
        </p>
      </Article>

      <Article title="10. Responsabilité">
        <p>
          ÉniEvent répond du fonctionnement de la plateforme. La bonne exécution de la
          prestation relève du prestataire, qui en est seul responsable.
        </p>
        <p>
          Nous ne pouvons être tenus responsables d&apos;une interruption due à un intervenant
          technique tiers, ni des informations publiées par un prestataire, que nous vérifions
          sans pouvoir les garantir.
        </p>
      </Article>

      <Article title="11. Litiges">
        <p>
          Écrivez-nous d&apos;abord à <strong>{ENTITY.email}</strong> : la plupart des
          désaccords se règlent en quelques échanges, et nous disposons de la trace de tous les
          règlements.
        </p>
        <p>
          À défaut d&apos;accord amiable, les présentes conditions sont régies par le{" "}
          <strong>droit béninois</strong> et les tribunaux compétents sont ceux de Cotonou.
        </p>
      </Article>

      <Article title="12. Évolution">
        <p>
          Ces conditions peuvent être modifiées. La version applicable à une réservation est
          celle en vigueur le jour où elle a été passée. Voir aussi les{" "}
          <Link href="/mentions-legales" className="font-semibold text-orange-600">
            mentions légales
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" className="font-semibold text-orange-600">
            politique de confidentialité
          </Link>
          .
        </p>
      </Article>
    </LegalPage>
  );
}
