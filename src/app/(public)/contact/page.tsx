import Link from "next/link";
import { Mail, MapPin, MessageSquare } from "lucide-react";

import { ENTITY, orTodo } from "@/lib/legal";

/**
 * Page de contact.
 *
 * **Pas de formulaire, et c'est délibéré.** Un formulaire qui n'aboutit dans
 * aucune boîte donne l'illusion d'un canal ouvert : le visiteur écrit, attend,
 * et n'obtient rien. Une adresse visible fonctionne, et le jour où une vraie
 * file de tickets existera, elle remplacera ceci.
 *
 * Les utilisateurs connectés sont renvoyés vers la messagerie : un message
 * attaché à une réservation vaut mieux qu'un courriel sans contexte.
 */

export const metadata = {
  title: "Nous contacter",
  description: "Comment joindre l'équipe ÉniEvent.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nous contacter</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Une question, un problème sur une réservation, une annonce à signaler ? Écrivez-nous.
        Nous répondons sous un jour ouvré.
      </p>

      <div className="mt-8 space-y-4">
        <a
          href={`mailto:${ENTITY.email}`}
          className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:border-orange-200 hover:bg-orange-50"
        >
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />
          <span>
            <span className="block font-bold text-slate-900">Par courriel</span>
            <span className="mt-0.5 block text-sm text-slate-600">{ENTITY.email}</span>
          </span>
        </a>

        <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5">
          <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden />
          <div>
            <p className="font-bold text-slate-900">Au sujet d&apos;une réservation</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
              Passez plutôt par la messagerie de votre espace : votre prestataire y répond
              directement, et l&apos;échange reste rattaché à la réservation.{" "}
              <Link href="/compte/messages" className="font-semibold text-orange-600">
                Mes messages
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <div>
            <p className="font-bold text-slate-900">Adresse</p>
            <p className="mt-0.5 text-sm text-slate-600">
              {orTodo(ENTITY.address)} — {ENTITY.city}, {ENTITY.country}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-sm leading-relaxed text-slate-500">
        Vous êtes prestataire et souhaitez rejoindre la plateforme ?{" "}
        <Link href="/pro/inscription" className="font-semibold text-orange-600">
          Créez votre espace partenaire
        </Link>{" "}
        — l&apos;inscription est gratuite, et vous ne payez qu&apos;une commission sur les
        réservations réellement encaissées.
      </p>
    </main>
  );
}
