import Link from "next/link";

import { Article, Entry, LegalPage } from "@/components/legal/LegalPage";
import { ENTITY, orTodo, PROCESSORS, publishedMentions } from "@/lib/legal";

/**
 * Mentions légales.
 *
 * Tout vient de `src/lib/legal.ts` : recopier un numéro RCCM ici garantirait
 * qu'il en reste un faux le jour où il change. Les champs non renseignés
 * s'affichent « à compléter » plutôt que d'être inventés.
 */

export const metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergement et contact du site ÉniEvent.",
};

export default function LegalNoticePage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Qui édite ce site, qui l'héberge, et comment nous joindre."
    >
      {/* La liste vit dans `legal.ts`, et le bandeau d'avertissement la relit :
          une ligne ne peut pas manquer ici sans qu'il le dise, ni lui annoncer
          un manque introuvable sur la page. */}
      <Article title="1. Éditeur du site">
        {publishedMentions().map(({ label, value }) => (
          <Entry key={label} label={label} value={orTodo(value)} />
        ))}
      </Article>

      <Article title="2. Hébergement">
        <p>
          Le site est hébergé et exécuté par <strong>Vercel Inc.</strong> (440 N Barranca Ave
          #4133, Covina, CA 91723, États-Unis), sur son infrastructure de Paris.
        </p>
        <p>
          Les données applicatives — comptes, annonces, réservations, messages — sont
          conservées par <strong>Supabase Inc.</strong> dans un centre de données situé à{" "}
          <strong>Paris, France</strong>.
        </p>
      </Article>

      <Article title="3. Ce qu'est ÉniEvent">
        <p>
          ÉniEvent est une <strong>place de marché</strong>. Elle met en relation des
          organisateurs d&apos;événements et des prestataires établis au Bénin — salles,
          traiteurs, décorateurs, techniciens, maîtres de cérémonie.
        </p>
        <p>
          <strong>ÉniEvent n&apos;est pas prestataire.</strong> Le contrat de prestation se
          conclut entre le client et le prestataire qu&apos;il a retenu. ÉniEvent encaisse le
          règlement pour le compte de ce dernier et lui reverse la somme, sa commission
          déduite. Le détail figure dans les{" "}
          <Link href="/conditions-generales" className="font-semibold text-orange-600">
            conditions générales
          </Link>
          .
        </p>
      </Article>

      <Article title="4. Propriété intellectuelle">
        <p>
          La marque ÉniEvent, le nom de domaine, la charte graphique et les développements du
          site appartiennent à l&apos;éditeur. Toute reproduction sans autorisation est
          interdite.
        </p>
        <p>
          Les photographies, descriptions et tarifs des annonces sont publiés par les
          prestataires, qui en conservent la propriété et en répondent. Un contenu qui vous
          semble illicite ou usurpé peut nous être signalé à {ENTITY.email} : nous le
          retirons sans délai s&apos;il l&apos;est.
        </p>
      </Article>

      <Article title="5. Prestataires techniques">
        <p>Le service s&apos;appuie sur les intervenants suivants :</p>
        <ul className="ml-4 list-disc space-y-1">
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.role} ({p.location})
            </li>
          ))}
        </ul>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link href="/confidentialite" className="font-semibold text-orange-600">
            politique de confidentialité
          </Link>
          .
        </p>
      </Article>

      <Article title="6. Nous joindre">
        <p>
          Par courriel à <strong>{ENTITY.email}</strong>, ou depuis la page{" "}
          <Link href="/contact" className="font-semibold text-orange-600">
            contact
          </Link>
          . Nous répondons sous un jour ouvré.
        </p>
      </Article>
    </LegalPage>
  );
}
