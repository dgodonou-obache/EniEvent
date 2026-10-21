"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, MoreHorizontal } from "lucide-react";

/**
 * Tableau de pilotage des espaces professionnels.
 *
 * Les listes de `/pro/devis` et `/pro/reservations` empilaient des cartes :
 * lisible à trois lignes, illisible à trente. On n'y comparait rien — ni deux
 * montants, ni deux dates — parce que rien n'était aligné, et chaque ligne
 * portait ses propres boutons d'action, ce qui faisait trois blocs empilés par
 * réservation. Un tableau répond à la question qu'on se pose réellement devant
 * une liste d'exploitation : **où en est chaque dossier, et lequel passe en
 * premier.**
 *
 * ⚠️ **On trie sur la donnée, jamais sur ce qu'on affiche.** « 1 100 000 FCFA »
 * et « 3 déc. 2026 » sont des chaînes : les comparer alphabétiquement range
 * 900 000 après 1 100 000 et décembre avant janvier, sans la moindre erreur
 * visible — juste un ordre faux que personne ne vérifie. D'où `valeurs` (ce
 * qu'on lit) et `tris` (ce qui compare), séparés, le second rempli côté serveur
 * avec la donnée brute.
 *
 * ⚠️ **Le menu d'actions s'ouvre en position fixe, et ce n'est pas un détail.**
 * Le tableau défile horizontalement dans son conteneur (`overflow-x-auto`), et
 * CSS impose qu'un axe en `auto` force l'autre à `auto` : un menu placé en
 * absolu dans ce conteneur est **rogné**, en haut comme en bas, quel que soit
 * son `z-index`. Même famille de piège que `backdrop-blur` et les contextes
 * d'empilement (`tests/stacking.test.ts`). Les coordonnées sont donc prises sur
 * le bouton au moment de l'ouverture, et le menu se referme au défilement
 * plutôt que de suivre — un menu ouvert qu'on fait glisser sous le curseur est
 * pire qu'un menu qui se ferme.
 *
 * Pas de cases à cocher : aucune action de masse n'existe dans ces écrans, et
 * une colonne de cases qui ne commande rien est le même défaut qu'un
 * interrupteur débranché.
 */

export type Ton = "neutre" | "attente" | "succes" | "alerte" | "eteint";

const TONS: Record<Ton, string> = {
  neutre: "bg-slate-100 text-slate-600",
  attente: "bg-orange-50 text-orange-600",
  succes: "bg-teal-50 text-teal-700",
  alerte: "bg-red-50 text-red-700",
  eteint: "bg-slate-100 text-slate-400",
};

export interface Colonne {
  cle: string;
  libelle: string;
  align?: "left" | "right";
  /** Faux pour une colonne dont l'ordre n'a aucun sens. */
  triable?: boolean;
  /**
   * Repliée sous `md`. Un téléphone montre les trois colonnes qui comptent ;
   * le reste reste atteignable en faisant défiler, ou sur la fiche.
   */
  secondaire?: boolean;
}

export interface Action {
  label: string;
  href: string;
}

export interface Ligne {
  id: string;
  /** Destination de la ligne entière. Le menu ne porte que le reste. */
  href: string;
  /** Ce qui s'affiche, déjà mis en forme côté serveur. */
  valeurs: Record<string, string>;
  /** Seconde ligne sous une valeur — référence, enseigne, catégorie. */
  details?: Record<string, string>;
  /** Ce qui compare. Absent : on retombe sur la valeur affichée. */
  tris?: Record<string, string | number>;
  /** Colonnes rendues en pastille plutôt qu'en texte. */
  tons?: Record<string, Ton>;
  actions?: Action[];
}

interface Props {
  colonnes: Colonne[];
  lignes: Ligne[];
  /** Colonne de tri initiale. Celle que l'écran range par défaut. */
  triInitial?: { cle: string; sens: "asc" | "desc" };
  /**
   * Nom de ce qu'on compte, aux deux nombres.
   *
   * ⚠️ Les deux formes, et non un `s` ajouté au vol : « devis » est invariable,
   * et « 34 deviss » serait la première chose qu'on lirait sur l'écran.
   */
  objet: { un: string; plusieurs: string };
}

const TAILLES = [10, 25, 50];

/** Rang d'une ligne pour une colonne : la donnée brute si elle existe. */
function rang(ligne: Ligne, cle: string): string | number {
  const brut = ligne.tris?.[cle];
  return brut ?? ligne.valeurs[cle] ?? "";
}

/**
 * Range les lignes, sans toucher à l'original.
 *
 * Exporté pour être éprouvé sans navigateur : un tri faux ne lève aucune
 * erreur et ne se voit qu'à l'œil, sur une colonne de chiffres qu'on croit
 * ordonnée. C'est précisément le genre de défaut qui survit des mois.
 */
export function trierLignes(
  lignes: readonly Ligne[],
  tri: { cle: string; sens: "asc" | "desc" } | null,
): Ligne[] {
  if (!tri) return [...lignes];

  const facteur = tri.sens === "asc" ? 1 : -1;

  return [...lignes].sort((a, b) => {
    const ga = rang(a, tri.cle);
    const gb = rang(b, tri.cle);

    if (typeof ga === "number" && typeof gb === "number") return (ga - gb) * facteur;

    // `localeCompare` et non `<` : « Élodie » doit se ranger près de
    // « Elodie », et non après « Zoé » comme le veut l'ordre des points de
    // code. Un catalogue béninois est plein d'accents.
    return String(ga).localeCompare(String(gb), "fr", { numeric: true }) * facteur;
  });
}

export function DataTable({ colonnes, lignes, triInitial, objet }: Props) {
  const router = useRouter();

  const [tri, setTri] = React.useState<{ cle: string; sens: "asc" | "desc" } | null>(
    triInitial ?? null,
  );
  const [taille, setTaille] = React.useState(TAILLES[0]);
  const [page, setPage] = React.useState(1);

  const triees = React.useMemo(() => trierLignes(lignes, tri), [lignes, tri]);

  const pages = Math.max(1, Math.ceil(triees.length / taille));

  // ⚠️ Une page courante au-delà du dernier rang afficherait un tableau vide
  // sans rien dire. On s'ajuste **pendant le rendu** plutôt que dans un effet,
  // qui peindrait d'abord le vide — même règle que la barre latérale.
  const [vueTaille, setVueTaille] = React.useState(taille);
  if (vueTaille !== taille) {
    setVueTaille(taille);
    setPage(1);
  }
  const courante = Math.min(page, pages);

  const visibles = triees.slice((courante - 1) * taille, courante * taille);

  function basculer(cle: string) {
    setTri((actuel) =>
      actuel?.cle === cle
        ? { cle, sens: actuel.sens === "asc" ? "desc" : "asc" }
        : { cle, sens: "asc" },
    );
    setPage(1);
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
              {colonnes.map((colonne) => (
                <th
                  key={colonne.cle}
                  scope="col"
                  aria-sort={
                    tri?.cle === colonne.cle
                      ? tri.sens === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
                    colonne.align === "right" ? "text-right" : ""
                  } ${colonne.secondaire ? "hidden md:table-cell" : ""}`}
                >
                  {colonne.triable === false ? (
                    colonne.libelle
                  ) : (
                    <button
                      type="button"
                      onClick={() => basculer(colonne.cle)}
                      className={`inline-flex items-center gap-1.5 uppercase tracking-wider transition-all duration-200 hover:text-orange-600 active:scale-[0.97] ${
                        tri?.cle === colonne.cle ? "text-orange-600" : ""
                      }`}
                    >
                      {colonne.libelle}
                      <Fleche actif={tri?.cle === colonne.cle ? tri.sens : null} />
                    </button>
                  )}
                </th>
              ))}
              <th scope="col" className="w-12 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {visibles.map((ligne) => (
              <tr
                key={ligne.id}
                onClick={() => router.push(ligne.href)}
                className="cursor-pointer border-b border-slate-50 transition-all duration-200 last:border-0 hover:bg-orange-50/50"
              >
                {colonnes.map((colonne, rangColonne) => {
                  const ton = ligne.tons?.[colonne.cle];
                  const valeur = ligne.valeurs[colonne.cle] ?? "—";
                  const detail = ligne.details?.[colonne.cle];

                  return (
                    <td
                      key={colonne.cle}
                      className={`px-4 py-3 align-middle ${
                        colonne.align === "right" ? "text-right tabular-nums" : ""
                      } ${colonne.secondaire ? "hidden md:table-cell" : ""}`}
                    >
                      {ton ? (
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONS[ton]}`}
                        >
                          {valeur}
                        </span>
                      ) : (
                        <>
                          {/* La première colonne porte le lien : une ligne de
                              tableau n'est pas focalisable au clavier, et un
                              écran qu'on ne peut parcourir qu'à la souris est
                              inatteignable pour une partie des gens. */}
                          {rangColonne === 0 ? (
                            <a
                              href={ligne.href}
                              onClick={(e) => e.stopPropagation()}
                              className="font-bold text-slate-900 transition-all duration-200 hover:text-orange-600"
                            >
                              {valeur}
                            </a>
                          ) : (
                            <span className={colonne.align === "right" ? "font-semibold text-slate-900" : "text-slate-600"}>
                              {valeur}
                            </span>
                          )}
                          {detail ? (
                            <span className="mt-0.5 block text-xs text-slate-400">{detail}</span>
                          ) : null}
                        </>
                      )}
                    </td>
                  );
                })}

                <td className="px-4 py-3 text-right">
                  <MenuActions actions={ligne.actions ?? []} href={ligne.href} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        courante={courante}
        pages={pages}
        taille={taille}
        total={triees.length}
        objet={objet}
        surPage={setPage}
        surTaille={setTaille}
      />
    </div>
  );
}

function Fleche({ actif }: { actif: "asc" | "desc" | null }) {
  if (actif === "asc") return <ChevronUp className="h-3 w-3" aria-hidden />;
  if (actif === "desc") return <ChevronDown className="h-3 w-3" aria-hidden />;
  return <ChevronsUpDown className="h-3 w-3 text-slate-300" aria-hidden />;
}

/**
 * Le menu « … » d'une ligne.
 *
 * ⚠️ **En position fixe, coordonnées prises à l'ouverture.** Voir l'en-tête du
 * module : un menu en absolu serait rogné par le conteneur à défilement du
 * tableau. Il se referme au défilement et au redimensionnement, le repère
 * n'étant valable qu'à l'instant où il a été pris.
 */
function MenuActions({ actions, href }: { actions: Action[]; href: string }) {
  const [place, setPlace] = React.useState<{ top: number; right: number } | null>(null);
  const bouton = React.useRef<HTMLButtonElement>(null);

  const toutes: Action[] = actions.length > 0 ? actions : [{ label: "Ouvrir", href }];

  React.useEffect(() => {
    if (!place) return;

    const fermer = () => setPlace(null);

    // `capture` : le défilement du conteneur du tableau ne remonte pas jusqu'à
    // la fenêtre, et le menu resterait accroché dans le vide.
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);

    return () => {
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [place]);

  function ouvrir(event: React.MouseEvent) {
    event.stopPropagation();

    if (place) {
      setPlace(null);
      return;
    }

    const rect = bouton.current?.getBoundingClientRect();
    if (!rect) return;

    setPlace({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={ouvrir}
        aria-haspopup="menu"
        aria-expanded={place !== null}
        aria-label="Actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.97]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {place ? (
        <>
          {/* Un voile transparent plutôt qu'un écouteur de document : il attrape
              le clic sans que la page se mette à bouger sous le doigt. */}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={(e) => {
              e.stopPropagation();
              setPlace(null);
            }}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            role="menu"
            style={{ top: place.top, right: place.right }}
            className="fixed z-50 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-lg"
          >
            {toutes.map((action) => (
              <a
                key={action.href + action.label}
                href={action.href}
                role="menuitem"
                onClick={(e) => e.stopPropagation()}
                className="block px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600"
              >
                {action.label}
              </a>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function Pagination({
  courante,
  pages,
  taille,
  total,
  objet,
  surPage,
  surTaille,
}: {
  courante: number;
  pages: number;
  taille: number;
  total: number;
  objet: { un: string; plusieurs: string };
  surPage: (page: number) => void;
  surTaille: (taille: number) => void;
}) {
  const premier = total === 0 ? 0 : (courante - 1) * taille + 1;
  const dernier = Math.min(courante * taille, total);

  return (
    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <label htmlFor="taille-page" className="whitespace-nowrap">
          Lignes par page
        </label>
        <select
          id="taille-page"
          value={taille}
          onChange={(e) => surTaille(Number(e.target.value))}
          className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 transition-all duration-200 focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20"
        >
          {TAILLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Dire **ce qu'on regarde**, et non le seul numéro de page : « 11 à 20
            sur 34 » se vérifie d'un coup d'œil, « page 2 » ne dit rien. */}
        <span className="hidden whitespace-nowrap sm:inline">
          {premier}–{dernier} sur {total} {total > 1 ? objet.plusieurs : objet.un}
        </span>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Fleche_ libelle="Précédent" versLaDroite={false} onClick={() => surPage(courante - 1)} inactif={courante === 1} />

          {numerosAutour(courante, pages).map((numero, index) =>
            numero === null ? (
              <span key={`saut-${index}`} className="px-2 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={numero}
                type="button"
                onClick={() => surPage(numero)}
                aria-current={numero === courante ? "page" : undefined}
                className={`h-9 min-w-9 rounded-xl px-2.5 text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
                  numero === courante
                    ? "bg-orange-500 text-white"
                    : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                }`}
              >
                {numero}
              </button>
            ),
          )}

          <Fleche_ libelle="Suivant" versLaDroite onClick={() => surPage(courante + 1)} inactif={courante === pages} />
        </nav>
      ) : null}
    </div>
  );
}

function Fleche_({
  libelle,
  versLaDroite,
  onClick,
  inactif,
}: {
  libelle: string;
  versLaDroite: boolean;
  onClick: () => void;
  inactif: boolean;
}) {
  const Icone = versLaDroite ? ChevronRight : ChevronLeft;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactif}
      className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-orange-50 hover:text-orange-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
    >
      {versLaDroite ? null : <Icone className="h-4 w-4" aria-hidden />}
      <span className="hidden sm:inline">{libelle}</span>
      {versLaDroite ? <Icone className="h-4 w-4" aria-hidden /> : null}
    </button>
  );
}

/**
 * Les numéros à montrer autour de la page courante.
 *
 * `null` marque une coupure. Exporté pour être éprouvé sans navigateur : une
 * pagination qui saute une page ne lève aucune erreur, elle rend simplement
 * des lignes inatteignables.
 */
export function numerosAutour(courante: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const retenus = new Set([1, pages, courante, courante - 1, courante + 1]);
  if (courante <= 3) [2, 3, 4].forEach((n) => retenus.add(n));
  if (courante >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => retenus.add(n));

  const ordonnes = [...retenus].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const sortie: (number | null)[] = [];

  for (const [index, numero] of ordonnes.entries()) {
    if (index > 0 && numero - ordonnes[index - 1] > 1) sortie.push(null);
    sortie.push(numero);
  }

  return sortie;
}
