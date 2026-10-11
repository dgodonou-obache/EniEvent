"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";

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

  /**
   * Quitte l'espace, par **navigation** et non par Server Action.
   *
   * ⚠️ **C'est la correction d'un défaut mesuré.** La coupure passait par la
   * Server Action `signOut` ; son POST était intercepté par le proxy, qui
   * répondait un 307. Un 307 conserve la méthode : le navigateur rejouait le
   * POST sur la page de connexion, qui ne connaît pas cette action, et Next
   * affichait « This page couldn't load » — lu comme une panne d'ÉniEvent.
   *
   * Et le cas n'était pas rare : c'était le chemin **nominal**. Le proxy ne
   * repose l'horodatage qu'une fois par minute, et ce composant n'appelle
   * `/api/session` qu'une fois par minute : la référence du serveur est donc
   * toujours un peu plus ancienne que la nôtre, et quand ce compte à rebours
   * atteint zéro, le proxy a déjà coupé.
   *
   * `assign` et non `replace` : revenir en arrière doit ramener où l'on était,
   * pas retenter une page devenue inaccessible.
   */
  const quitter = React.useCallback(() => {
    if (!signInTo) return;
    const suivant = encodeURIComponent(`${signInTo}?raison=inactivite`);

    // ⚠️ **Un chargement de document, délibérément — pas `router.push`.** Le
    // linter de Next suggère le routeur, mais sa prémisse ne tient pas ici : la
    // cible est un **gestionnaire de route**, pas une page. Une navigation côté
    // client n'y mènerait pas, et surtout elle ne laisserait pas le navigateur
    // appliquer les `Set-Cookie` d'effacement ni suivre la redirection qui
    // suit. C'est précisément ce détour par le client qu'on cherche à éviter.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/auth/deconnexion?suivant=${suivant}`);
  }, [signInTo]);

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
        quitter();
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
  }, [delai, pathname, quitter, signInTo]);

  if (!signInTo) return null;

  const minutes = Math.floor((restant ?? 0) / 60);
  const secondes = (restant ?? 0) % 60;

  return (
    <>
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
                onClick={quitter}
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
