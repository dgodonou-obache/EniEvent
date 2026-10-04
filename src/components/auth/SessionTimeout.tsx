"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  REFRESH_AFTER_SECONDS,
  WARN_BEFORE_SECONDS,
  timeoutFor,
} from "@/lib/auth/inactivity";

/**
 * Prévenir avant que la session ne tombe, puis la couper.
 *
 * ⚠️ **L'écran n'est pas l'autorité.** Le proxy décide, à chaque requête, à
 * partir d'un horodatage signé qu'on ne peut pas repousser depuis le
 * navigateur. Ce composant ne fait qu'**avertir** et entretenir cet horodatage.
 * Quelqu'un qui le désactiverait ne gagnerait rien : sa requête suivante serait
 * refusée de la même façon. Il emploie donc `timeoutFor`, la fonction même du
 * proxy, plutôt qu'une durée recopiée qui finirait par diverger.
 *
 * **Une page lue n'émet aucune requête.** C'est tout le problème : remplir un
 * long formulaire, relire un devis, comparer deux annonces — rien de tout cela
 * ne touche le serveur, et le proxy n'y verrait que de l'inactivité. Un geste
 * réel appelle donc `/api/session`, au plus une fois par minute, ce qui suffit
 * à repousser l'échéance sans bavarder.
 *
 * **Une fois l'avertissement affiché, seul un clic prolonge.** Si un mouvement
 * de souris suffisait, la fenêtre disparaîtrait sans que personne n'ait rien
 * lu — et la coupure, quand elle viendrait, serait de nouveau une surprise.
 * C'est la seule période où les gestes passifs sont ignorés.
 *
 * **Sans `signInTo`, il entretient la session sans jamais avertir.** C'est la
 * forme montée sur le site public, et elle suit le proxy, qui ne déroute pas
 * la navigation hors d'un espace protégé. Elle répare surtout un effet de bord
 * du délai court : quelqu'un qui lit une fiche annonce un quart d'heure
 * **n'est pas inactif**, il fait exactement ce qu'on attend de lui. Sans ce
 * montage, il se retrouverait déconnecté au moment de cliquer « Réserver ».
 */

/** Gestes comptés comme une présence. Pas `mousemove` : un trackpad frôlé ne prouve rien. */
const GESTES = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;

export function SessionTimeout({ signInTo }: { signInTo?: string }) {
  const pathname = usePathname();
  const delai = timeoutFor(pathname);

  /** Secondes restantes, ou `null` tant qu'on n'avertit pas. */
  const [restant, setRestant] = React.useState<number | null>(null);

  const derniereActivite = React.useRef(0);
  const dernierAppel = React.useRef(0);
  /**
   * Doublon volontaire de `restant !== null` : les écouteurs sont posés une
   * fois pour toutes et liraient sinon un état figé au premier rendu.
   */
  const avertit = React.useRef(false);
  const formulaire = React.useRef<HTMLFormElement>(null);

  const prolonger = React.useCallback(() => {
    const maintenant = Date.now();
    derniereActivite.current = maintenant;
    avertit.current = false;
    setRestant(null);

    if (maintenant - dernierAppel.current < REFRESH_AFTER_SECONDS * 1000) return;
    dernierAppel.current = maintenant;
    // Un échec réseau ne se signale pas : au pire la session tombera, ce que
    // l'utilisateur verra bien assez tôt. Afficher une erreur ici serait du
    // bruit sur un appel qu'il n'a pas demandé.
    void fetch("/api/session", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  React.useEffect(() => {
    const geste = () => {
      if (avertit.current) return;
      prolonger();
    };

    for (const nom of GESTES) window.addEventListener(nom, geste, { passive: true });
    return () => {
      for (const nom of GESTES) window.removeEventListener(nom, geste);
    };
  }, [prolonger]);

  React.useEffect(() => {
    // Chaque navigation est passée par le proxy, qui a reposé l'horodatage :
    // le compte à rebours repart de zéro, ici comme là-bas.
    derniereActivite.current = Date.now();
    dernierAppel.current = Date.now();
    avertit.current = false;

    // Sans destination, rien à avertir ni à couper : le battement n'a pas lieu
    // d'être, seuls les gestes entretiennent la session.
    if (!signInTo) return;

    const battement = setInterval(() => {
      const reste = delai - Math.round((Date.now() - derniereActivite.current) / 1000);

      if (reste <= 0) {
        avertit.current = true;
        formulaire.current?.requestSubmit();
        return;
      }

      if (reste <= WARN_BEFORE_SECONDS) {
        avertit.current = true;
        setRestant(reste);
      } else {
        setRestant((valeur) => (valeur === null ? valeur : null));
      }
    }, 1000);

    return () => clearInterval(battement);
  }, [delai, pathname, signInTo]);

  if (!signInTo) return null;

  const minutes = Math.floor((restant ?? 0) / 60);
  const secondes = (restant ?? 0) % 60;

  return (
    <>
      {/*
        La déconnexion passe par le même chemin que le bouton « Déconnexion » :
        une Server Action, pas un appel depuis le navigateur. Le `?raison=`
        fait afficher l'explication par `SignInNotice` à l'arrivée, sans quoi
        la page de connexion ressemblerait à une panne.
      */}
      <form ref={formulaire} action={signOut.bind(null, `${signInTo}?raison=inactivite`)} hidden>
        <button type="submit" tabIndex={-1} aria-hidden />
      </form>

      {restant !== null ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="titre-inactivite"
          aria-describedby="texte-inactivite"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50">
              <Clock className="h-5 w-5 text-orange-600" aria-hidden />
            </div>

            <h2 id="titre-inactivite" className="mt-4 font-bold text-slate-900">
              Toujours là ?
            </h2>

            <p id="texte-inactivite" className="mt-1 text-sm leading-relaxed text-slate-500">
              Sans réponse, vous serez déconnecté dans{" "}
              <span className="font-bold tabular-nums text-slate-900">
                {minutes}:{String(secondes).padStart(2, "0")}
              </span>
              . C&apos;est ce qui protège votre compte si vous laissez cet appareil sans
              surveillance.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={prolonger} autoFocus className="sm:flex-1">
                Rester connecté
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => formulaire.current?.requestSubmit()}
                className="sm:flex-1"
              >
                Se déconnecter
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
