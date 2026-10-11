"use client";

import * as React from "react";
import { Clock, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Le filet, quand une action échoue parce que la session est tombée.
 *
 * ⚠️ **Ce que ce composant remplace.** Sans lui, Next affiche son écran
 * intégré — « This page couldn't load », deux boutons gris, aucun contexte. Un
 * utilisateur y lit une panne d'ÉniEvent, pas une déconnexion.
 *
 * **Le cas qui l'amène ici**, mesuré : une session expirée et une **Server
 * Action** soumise ensuite. Le proxy répond un 307, le navigateur rejoue le
 * POST sur la page de connexion — en-tête `Next-Action` compris — et Next
 * répond « Server action not found ». La coupure automatique passe désormais
 * par une navigation (`/auth/deconnexion`) et ne provoque plus cela ; mais un
 * formulaire enregistré longtemps après l'échéance le peut encore.
 *
 * ⚠️ **On ne devine pas la cause, on la demande.** Afficher « votre session a
 * expiré » sur une vraie panne serait un mensonge, et c'est exactement le
 * défaut qu'on corrige — un écran qui raconte autre chose que ce qui s'est
 * passé. Le composant interroge donc `/api/session` : `401` veut dire qu'il n'y
 * a plus de session, et seulement alors il le dit. Tant que la réponse n'est
 * pas revenue, il n'affirme rien.
 *
 * ⚠️ **Le délai n'est écrit nulle part.** Annoncer « quinze minutes » invite à
 * compter, et surtout : ce chiffre se règle en base et finirait par diverger de
 * la phrase. On dit ce qui s'est passé, pas au bout de combien de temps.
 */

type Verdict = "inconnu" | "expiree" | "autre";

export function SessionExpiree({
  signInTo,
  reset,
}: {
  /** Page de connexion de **cet** espace : un partenaire ne va pas sur `/connexion`. */
  signInTo: string;
  /** Re-tente le rendu. Fourni par la frontière d'erreur de Next. */
  reset: () => void;
}) {
  const [verdict, setVerdict] = React.useState<Verdict>("inconnu");

  React.useEffect(() => {
    let vivant = true;

    fetch("/api/session", { method: "POST" })
      .then((r) => {
        if (vivant) setVerdict(r.status === 401 ? "expiree" : "autre");
      })
      // Hors ligne, ou serveur injoignable : on ne sait pas, et on ne prétend
      // pas. L'écran reste sur sa formulation neutre.
      .catch(() => {
        if (vivant) setVerdict("autre");
      });

    return () => {
      vivant = false;
    };
  }, []);

  if (verdict === "expiree") {
    return (
      <Encart
        icone={<Clock className="h-6 w-6 text-orange-500" aria-hidden />}
        titre="Votre session a expiré"
        texte="Vous avez été déconnecté après une période d'inactivité, pour protéger votre compte. Reconnectez-vous pour reprendre où vous en étiez."
        action={
          <a href={`${signInTo}?raison=inactivite`}>
            <Button>Se reconnecter</Button>
          </a>
        }
      />
    );
  }

  return (
    <Encart
      icone={<TriangleAlert className="h-6 w-6 text-orange-500" aria-hidden />}
      titre={verdict === "inconnu" ? "Un instant…" : "Cette page n'a pas pu s'afficher"}
      texte={
        verdict === "inconnu"
          ? "Nous vérifions ce qui s'est passé."
          : "Réessayez : si cela se reproduit, écrivez-nous et nous regarderons."
      }
      action={
        verdict === "inconnu" ? null : (
          <Button type="button" onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Réessayer
          </Button>
        )
      }
    />
  );
}

function Encart({
  icone,
  titre,
  texte,
  action,
}: {
  icone: React.ReactNode;
  titre: string;
  texte: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
        {icone}
      </div>
      <h1 className="mt-4 text-xl font-bold text-slate-900">{titre}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{texte}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
