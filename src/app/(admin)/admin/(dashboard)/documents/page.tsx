import { KycReview } from "@/components/admin/KycReview";
import { requireUser } from "@/lib/auth/session";
import { getKycDossiers } from "@/lib/admin";

/**
 * Dossiers des partenaires.
 *
 * ⚠️ **Cet écran manquait, et son absence était invisible.** Le tableau de bord
 * annonçait « Dossiers KYC à vérifier » en comptant `partner_profiles.is_verified
 * = false` — un drapeau booléen sans aucun lien avec un document — et renvoyait
 * vers l'écran des **commissions**. Mesuré le 5 novembre 2026 : zéro pièce
 * déposée dans toute la base, zéro fichier dans le coffre. Il n'y avait donc
 * aucun dossier à vérifier, et aucun endroit pour le faire.
 *
 * Ce que montre cet écran, dans cet ordre : **ce qui manque à chaque dossier**,
 * puis les pièces reçues. L'ordre n'est pas cosmétique — ce qui manque est la
 * seule chose qui appelle une action, et c'est ce qu'on dicte au partenaire
 * quand on le relance.
 *
 * Les structures sans aucune pièce y figurent aussi : ce sont précisément
 * celles qu'il faut relancer, et un écran qui ne montrerait que les dossiers
 * commencés les rendrait invisibles.
 */

export const metadata = { title: "Dossiers partenaires" };

export default async function AdminKycPage() {
  await requireUser("/admin/connexion");

  const dossiers = await getKycDossiers();

  const aTrancher = dossiers.reduce((total, d) => total + d.pending, 0);
  const valides = dossiers.filter((d) => d.verified).length;
  const bloquees = dossiers
    .filter((d) => !d.verified)
    .reduce((total, d) => total + d.listingsWaiting, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dossiers partenaires</h1>
        <p className="mt-1 text-sm text-slate-500">
          {dossiers.length} structure{dossiers.length > 1 ? "s" : ""} · {valides} dossier
          {valides > 1 ? "s" : ""} validé{valides > 1 ? "s" : ""}
          {aTrancher > 0
            ? ` · ${aTrancher} pièce${aTrancher > 1 ? "s" : ""} à trancher`
            : " · aucune pièce en attente"}
        </p>
      </div>

      <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong>Ce que la validation déclenche.</strong> Un dossier complet allume le badge
        « vérifié » du prestataire et autorise la mise en ligne de ses annonces. Un partenaire
        dépose ses annonces quand il veut, mais elles ne deviennent visibles qu&apos;une fois
        son dossier validé. Refuser une pièce déjà validée éteint le badge.
      </p>

      {/* La conséquence concrète, chiffrée : un dossier n'est pas un formalisme
          quand il bloque la mise en ligne d'annonces réelles. */}
      {bloquees > 0 ? (
        <p className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-relaxed text-orange-900">
          <span className="font-bold">
            {bloquees} annonce{bloquees > 1 ? "s" : ""} en attente de mise en ligne
          </span>{" "}
          {bloquees > 1 ? "dépendent" : "dépend"} d&apos;un dossier non validé.
        </p>
      ) : null}

      <KycReview dossiers={dossiers} />
    </div>
  );
}
