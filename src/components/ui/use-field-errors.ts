"use client";

import * as React from "react";

/**
 * Marque les champs fautifs et emmène l'utilisateur au premier d'entre eux.
 *
 * **Le problème qu'elle résout.** Sur un formulaire long — la création d'une
 * annonce en compte quinze champs — l'erreur tombe souvent hors de l'écran.
 * L'utilisateur valide, rien ne semble se passer, et il reclique. Il n'a aucun
 * moyen de deviner qu'une ligne est en rouge huit cents pixels plus bas.
 *
 * **Pourquoi le marquage est impératif et non déclaratif.** Poser `aria-invalid`
 * sur chacun des cinquante-deux champs répartis dans six formulaires aurait été
 * cinquante-deux occasions d'en oublier un — et un champ oublié ne rougit pas,
 * sans que rien ne le signale. Le rattachement se fait donc ici, par le `name`
 * du champ, qui est déjà la clé employée par la validation : les deux ne
 * peuvent pas diverger.
 *
 * Trois détails qui font la différence à l'usage :
 *
 * - **le rouge s'efface dès qu'on corrige** — un champ encore rouge alors qu'on
 *   vient de le réparer fait douter de la correction ;
 * - **on ne défile pas à chaque frappe** : l'effet suit l'identité de l'objet
 *   d'erreurs, qui ne change qu'au retour d'une validation, jamais au clavier ;
 * - **le défilement respecte `prefers-reduced-motion`** — une animation
 *   imposée à qui l'a désactivée est une gêne, pas une attention.
 */

type Errors = Record<string, string | undefined> | undefined | null;

/** Champs porteurs d'une valeur, susceptibles d'être signalés. */
const CONTROLS = "input, select, textarea";

/**
 * Quels champs signaler, **dans l'ordre où on les rencontre à l'écran**.
 *
 * Isolée du DOM pour être éprouvée : c'est ici que se joue la seule subtilité
 * de tout le mécanisme. L'objet d'erreurs vient de Zod ou d'une Server Action,
 * et **l'ordre de ses clés ne veut rien dire** — il suit la déclaration du
 * schéma, pas la mise en page. Emmener l'utilisateur au « premier » champ de
 * cet objet le ferait remonter au milieu du formulaire alors qu'une erreur
 * l'attend plus haut.
 *
 * Les clés sans champ correspondant — une erreur globale, un groupe de cases —
 * sont ignorées : mieux vaut ne déplacer personne que de déplacer au hasard.
 */
export function invalidFieldNames(errors: Errors, namesInDomOrder: readonly string[]): string[] {
  const fautifs = new Set(
    Object.entries(errors ?? {})
      .filter(([, message]) => Boolean(message))
      .map(([nom]) => nom),
  );

  if (fautifs.size === 0) return [];

  // Un même `name` peut apparaître deux fois (un groupe de cases à cocher) :
  // on ne retient que la première occurrence, celle qui recevra le focus.
  const vus = new Set<string>();

  return namesInDomOrder.filter((nom) => {
    if (!fautifs.has(nom) || vus.has(nom)) return false;
    vus.add(nom);
    return true;
  });
}

export function useFieldErrors(errors: Errors) {
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    // Repartir d'une ardoise nette : sans cela, un champ corrigé garderait sa
    // bordure rouge jusqu'au rechargement de la page.
    for (const marque of form.querySelectorAll("[aria-invalid]")) {
      marque.removeAttribute("aria-invalid");
    }

    const controls = [...form.querySelectorAll<HTMLElement>(CONTROLS)];
    const noms = controls.map((c) => c.getAttribute("name") ?? "");

    // L'ordre du DOM est celui de la lecture : c'est lui qui décide où emmener
    // l'utilisateur, jamais l'ordre des clés de l'objet d'erreurs.
    const aSignaler = invalidFieldNames(errors, noms);
    if (aSignaler.length === 0) return;

    const marque = new Set(aSignaler);
    for (const control of controls) {
      const nom = control.getAttribute("name");
      if (nom && marque.has(nom)) control.setAttribute("aria-invalid", "true");
    }

    const premier = controls.find((c) => c.getAttribute("name") === aSignaler[0]);
    if (!premier) return;

    const sansAnimation = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    premier.scrollIntoView({
      behavior: sansAnimation ? "auto" : "smooth",
      block: "center",
    });

    // `preventScroll` parce que le défilement vient d'être demandé juste
    // au-dessus : sans lui, le navigateur en déclenche un second, brutal, qui
    // annule l'animation.
    premier.focus({ preventScroll: true });
  }, [errors]);

  // Le rouge s'efface au fil de la correction, champ par champ.
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const nettoyer = (event: Event) => {
      const cible = event.target as HTMLElement | null;
      cible?.removeAttribute?.("aria-invalid");
    };

    form.addEventListener("input", nettoyer);
    form.addEventListener("change", nettoyer);

    return () => {
      form.removeEventListener("input", nettoyer);
      form.removeEventListener("change", nettoyer);
    };
  }, []);

  return formRef;
}
