import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as money from "@/lib/money";

/**
 * Les tarifs affichés dans un calendrier.
 *
 * ⚠️ **Le montant affiché est le montant saisi.** Décision d'exploitation du
 * 1er novembre 2026, prise après qu'une date saisie à **1 500 F se soit
 * affichée « 2k »** — `Math.round(1500 / 1000)` vaut 2. Deux surfaces étaient
 * touchées, et la seconde est la pire :
 *
 * - le **planning du partenaire**, où la case était la seule vue qu'il avait de
 *   son tarif : il en a conclu, à juste titre, que le système avait changé son
 *   prix. La base, elle, avait toujours raison ;
 * - le **calendrier d'une fiche**, où le même chiffre faux s'affichait sous les
 *   yeux d'un acheteur, sur la page où il décide de réserver.
 *
 * `abbreviate` avait déjà été rapiécée une fois — « ne jamais abréger vers
 * zéro », après qu'un tarif de 10 F se soit affiché « 0k » — puis une seconde,
 * pour borner l'écart à 5 %. Deux correctifs sur une fonction dont le travail
 * est de rendre un montant qui n'est pas le montant : elle a été **supprimée**,
 * pas réglée. Un tarif qui ne tient pas dans une case est un problème de case.
 *
 * Ce fichier interdit son retour, sous ce nom ou sous un autre.
 */

const racine = fileURLToPath(new URL("../src/", import.meta.url));
const projet = fileURLToPath(new URL("../", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) return sources(chemin);
    return /\.tsx?$/.test(entree.name) ? [chemin] : [];
  });
}

const fichiers = sources(racine);

describe("aucun montant abrégé", () => {
  it("n'expose plus de fonction d'abréviation", () => {
    // Laisser la fonction en place, inutilisée, remettrait le piège à portée du
    // prochain calendrier — c'est ce qui est arrivé à `PlaceholderPage`.
    expect(Object.keys(money)).not.toContain("abbreviate");
  });

  it("ne rend plus aucun montant en « k » ni en « M »", () => {
    const coupables: string[] = [];

    for (const chemin of fichiers) {
      const source = readFileSync(chemin, "utf8");
      // Les commentaires racontent le défaut : on ne regarde que le code.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      // Un gabarit qui colle « k » ou « M » derrière une division par mille ou
      // par un million : la forme exacte qu'avait `abbreviate`.
      if (/\/\s*1[_\s]?000[_\s]?(000)?\s*\)?\s*\}?\s*(k|M)\b/.test(code)) {
        coupables.push(relative(projet, chemin));
      }

      if (/\babbreviate\b/.test(code)) coupables.push(relative(projet, chemin));
    }

    expect(
      coupables,
      `Un montant abrégé est un montant faux — le prix affiché doit être le prix saisi.\n${coupables.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * Les deux calendriers qui portent des tarifs doivent passer par `format`,
   * seul chemin autorisé pour un montant (`CLAUDE.md` §1). La devise y est
   * retirée — la colonne entière est dans la même, et la répéter sur chaque
   * jour du mois mangerait la place qui sert au chiffre.
   */
  it("fait passer les tarifs de calendrier par le formateur de money.ts", () => {
    const CALENDRIERS = [
      "src/components/dashboard/PlanningBoard.tsx",
      "src/components/marketplace/BookingBox.tsx",
    ];

    for (const chemin of CALENDRIERS) {
      const source = readFileSync(join(projet, chemin), "utf8");

      expect(source, chemin).toMatch(/\bformat(Money)?\(/);
      expect(source, chemin).toMatch(/withCurrency:\s*false/);
    }
  });
});
