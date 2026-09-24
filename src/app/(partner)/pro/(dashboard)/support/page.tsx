import Link from "next/link";
import { BookOpen, Clock, LifeBuoy, Mail } from "lucide-react";

import { SupportForm } from "@/components/partner/SupportForm";
import { requireSpace } from "@/lib/auth/session";
import { ENTITY } from "@/lib/legal";
import { createClient } from "@/utils/supabase/server";

/**
 * Aide et support.
 *
 * **Les réponses avant le formulaire.** Les trois questions ci-dessous sont
 * celles qui reviennent — quand suis-je payé, pourquoi mon annonce n'apparaît
 * pas, que voit le client. Un partenaire qui trouve sa réponse n'écrit pas, et
 * c'est le but : un support qui répond vite est un support peu sollicité.
 *
 * ⚠️ **Aucune promesse de délai qu'on ne tient pas.** « Réponse sous 2 heures »
 * sur une équipe qui n'a pas d'astreinte se retourne contre nous au premier
 * week-end. « En général sous un jour ouvré » se tient.
 *
 * ⚠️ **Ce n'est pas une messagerie** : la réponse arrive par courriel, et
 * l'écran le dit. Laisser croire qu'elle s'affichera ici ferait revenir le
 * partenaire pour rien, puis conclure qu'on l'ignore.
 */

export const metadata = { title: "Aide & support" };

const QUESTIONS = [
  {
    q: "Quand suis-je payé ?",
    a:
      "Après la prestation, jamais avant. Un acompte réglé trois mois à l'avance reste " +
      "retenu jusqu'à la date de l'événement : c'est ce qui permet de rembourser un client " +
      "qui annule, sans que l'argent soit déjà parti. Une réservation annulée devient " +
      "versable immédiatement, l'annulation étant définitive.",
    lien: { href: "/pro/finances/versements", label: "Voir mes versements" },
  },
  {
    q: "Pourquoi mon annonce n'apparaît-elle pas dans les résultats ?",
    a:
      "Trois causes, dans cet ordre de fréquence : elle n'est pas encore validée par la " +
      "modération, elle n'a aucune date ouverte au planning, ou elle est en pause. Une " +
      "annonce sans date ne peut pas être réservée, donc elle ne s'affiche pas dans une " +
      "recherche par date.",
    lien: { href: "/pro/planning", label: "Ouvrir des dates" },
  },
  {
    q: "Combien le client paie-t-il de plus que mon prix ?",
    a:
      "Rien. Le client règle exactement le tarif que vous affichez, sans frais d'aucune " +
      "sorte. La plateforme se rémunère sur une commission prélevée sur votre part au " +
      "moment de l'encaissement — elle est invisible pour lui, et détaillée pour vous.",
    lien: { href: "/pro/finances/revenus", label: "Voir mes revenus" },
  },
  {
    q: "Le client voit-il mon numéro de téléphone ?",
    a:
      "Pas avant d'avoir payé. Les coordonnées sont masquées dans la messagerie tant " +
      "qu'aucun règlement n'a été encaissé, des deux côtés. Elles apparaissent en clair " +
      "dès le premier paiement, pour que vous puissiez vous organiser directement.",
    lien: { href: "/pro/messages", label: "Ouvrir la messagerie" },
  },
];

export default async function PartnerSupportPage() {
  const { context, decision } = await requireSpace("partner", "/pro/connexion");
  if (!decision.granted) return null;

  const supabase = await createClient();

  // Les demandes déjà envoyées : sans elles, un partenaire qui a écrit hier ne
  // sait pas si son message est parti, et écrit une seconde fois.
  const { data: envoyees } = await supabase
    .from("support_requests")
    .select("id, subject, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Aide &amp; support</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les réponses aux questions fréquentes, puis de quoi nous écrire.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <BookOpen className="h-4 w-4 text-slate-400" aria-hidden />
          Questions fréquentes
        </h2>

        <ul className="space-y-2">
          {QUESTIONS.map((item) => (
            <li
              key={item.q}
              className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300"
            >
              <p className="font-semibold text-slate-900">{item.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.a}</p>
              <Link
                href={item.lien.href}
                className="mt-2 inline-block text-xs font-semibold text-orange-600 transition-all duration-200 hover:text-orange-700"
              >
                {item.lien.label} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <LifeBuoy className="h-4 w-4 text-slate-400" aria-hidden />
          Nous écrire
        </h2>

        <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Réponse en général sous un jour ouvré
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Par courriel, pas dans cet écran
          </span>
        </p>

        <SupportForm defaultEmail={context.user.email ?? ""} />

        {envoyees && envoyees.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Vos derniers messages
            </h3>
            <ul className="space-y-1.5">
              {envoyees.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                    {d.subject}
                  </span>
                  <span
                    className={
                      d.status === "closed"
                        ? "shrink-0 text-slate-400"
                        : "shrink-0 font-semibold text-orange-600"
                    }
                  >
                    {d.status === "closed" ? "Traité" : "En cours"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Vous pouvez aussi écrire directement à{" "}
          <a href={`mailto:${ENTITY.email}`} className="font-semibold text-slate-700 underline">
            {ENTITY.email}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
