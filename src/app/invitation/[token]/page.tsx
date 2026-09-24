import Link from "next/link";
import { AlertTriangle, Building2, UserCheck } from "lucide-react";

import { AcceptInvitation } from "@/components/shared/AcceptInvitation";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";
import { COMPANY_ROLE_LABELS } from "@/lib/validation/company";
import { PARTNER_ROLE_LABELS } from "@/lib/validation/partner";

/**
 * Rejoindre une équipe.
 *
 * ⚠️ **Cette page est publique, et doit l'être.** L'invité arrive presque
 * toujours sans compte : l'envoyer d'abord se connecter lui ferait découvrir
 * un écran de connexion sans savoir de quoi il s'agit. On lui montre donc qui
 * l'invite et à quel titre **avant** de lui demander quoi que ce soit.
 *
 * ⚠️ **Rien de sensible n'en sort.** `invitation_preview` rend le nom de la
 * structure, le rôle proposé et l'adresse invitée — jamais le jeton, jamais la
 * liste des membres. Quelqu'un qui devine une URL n'apprend que ce que
 * l'invitation elle-même contenait.
 *
 * L'adresse affichée est volontaire : c'est la seule avec laquelle le lien
 * fonctionnera, et le dire d'avance évite l'aller-retour « pourquoi ça
 * refuse » avec un compte créé sur une autre boîte.
 */

export const metadata = { title: "Invitation" };

interface Preview {
  org_name: string | null;
  org_type: "company" | "partner";
  role: string;
  email: string;
  expired: boolean;
  already_accepted: boolean;
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("invitation_preview", { jeton: token });

  const preview = ((data ?? []) as Preview[])[0] ?? null;
  const user = await getUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
      <div className="w-full">
        <p className="mb-6 text-center text-xl font-bold tracking-tight text-slate-900">
          <span className="text-orange-500">Éni</span>Event
        </p>

        {preview === null ? (
          <Etat
            ton="alerte"
            titre="Cette invitation n'existe pas"
            texte="Le lien est incomplet, ou l'invitation a été remplacée par une plus récente. Demandez à votre contact de vous en renvoyer une."
          />
        ) : preview.already_accepted ? (
          <Etat
            ton="neutre"
            titre="Invitation déjà utilisée"
            texte="Vous faites normalement déjà partie de cette équipe. Connectez-vous pour y accéder."
            action={{ href: "/connexion", label: "Se connecter" }}
          />
        ) : preview.expired ? (
          <Etat
            ton="alerte"
            titre="Cette invitation a expiré"
            texte="Les invitations sont valables quinze jours. Demandez à votre contact de vous en envoyer une nouvelle — cela ne prend qu'un instant."
          />
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50">
                <Building2 className="h-5 w-5 text-orange-500" aria-hidden />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900">
                  {preview.org_name ?? "Une structure"} vous invite
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  En tant que{" "}
                  <strong className="text-slate-700">
                    {(preview.org_type === "partner"
                      ? PARTNER_ROLE_LABELS
                      : COMPANY_ROLE_LABELS)[preview.role] ?? preview.role}
                  </strong>
                  , sur l&apos;espace{" "}
                  {preview.org_type === "partner" ? "partenaire" : "entreprise"}.
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              Cette invitation a été envoyée à{" "}
              <strong className="text-slate-900">{preview.email}</strong>. Elle ne fonctionne
              qu&apos;avec cette adresse : si votre compte ÉniEvent en utilise une autre,
              connectez-vous avec celle-ci ou demandez une invitation à jour.
            </p>

            {user ? (
              <AcceptInvitation token={token} />
            ) : (
              <div className="mt-5 space-y-2">
                <Link
                  href={`/inscription?suivant=${encodeURIComponent(`/invitation/${token}`)}`}
                  className="block"
                >
                  <Button className="w-full">
                    <UserCheck className="mr-2 h-4 w-4" aria-hidden />
                    Créer mon compte et rejoindre
                  </Button>
                </Link>

                <Link
                  href={`/connexion?suivant=${encodeURIComponent(`/invitation/${token}`)}`}
                  className="block text-center text-sm font-medium text-slate-600 transition-all duration-200 hover:text-orange-600"
                >
                  J&apos;ai déjà un compte
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Etat({
  ton,
  titre,
  texte,
  action,
}: {
  ton: "alerte" | "neutre";
  titre: string;
  texte: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
      <span
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
          ton === "alerte" ? "bg-amber-50" : "bg-slate-100"
        }`}
      >
        <AlertTriangle
          className={`h-6 w-6 ${ton === "alerte" ? "text-amber-600" : "text-slate-500"}`}
          aria-hidden
        />
      </span>

      <h1 className="mt-4 text-base font-bold text-slate-900">{titre}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{texte}</p>

      {action ? (
        <Link href={action.href} className="mt-5 inline-block">
          <Button variant="outline">{action.label}</Button>
        </Link>
      ) : null}
    </div>
  );
}
