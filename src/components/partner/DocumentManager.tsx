"use client";

import * as React from "react";
import { AlertTriangle, Check, Clock, Eye, FileCheck, Loader2, Trash2, Upload } from "lucide-react";

import {
  registerDocument,
  removeDocument,
  signDocument,
  type KycState,
} from "@/app/(partner)/pro/(dashboard)/documents/actions";
import { Button } from "@/components/ui/button";
import {
  KYC_ACCEPTED,
  KYC_BUCKET,
  KYC_STATUS_LABELS,
  buildKycPath,
  checkKycFile,
  type KycDocumentType,
  type KycStatus,
} from "@/lib/kyc";
import { KYC_TYPES } from "@/lib/validation/partner";
import { createClient } from "@/utils/supabase/client";

/**
 * Dépôt des pièces justificatives.
 *
 * **Le fichier part du navigateur vers le stockage**, sans passer par le
 * serveur Next — même raison que pour les photos d'annonce : sur une connexion
 * mobile béninoise, faire transiter 8 Mo deux fois doublerait l'attente. Les
 * politiques de stockage vérifient le chemin ; l'action serveur qui suit ne
 * tient que le registre.
 *
 * ⚠️ **Aucune URL publique n'est construite ici.** Le seau est privé : relire
 * une pièce demande une URL signée, émise par `signDocument` et valable une
 * minute. Un composant qui bricolerait une URL `…/object/public/…` rendrait
 * lisibles des pièces d'identité à qui devinerait l'adresse.
 *
 * **Une pièce validée ne se retire plus** : elle justifie une décision de la
 * plateforme. Le bouton disparaît, et la base refuserait de toute façon.
 */

export interface KycDocument {
  id: string;
  type: KycDocumentType;
  status: KycStatus;
  rejectionReason: string | null;
  createdAt: string;
}

const STATUTS: Record<KycStatus, { classe: string; icone: typeof Check }> = {
  pending: { classe: "bg-amber-50 text-amber-700", icone: Clock },
  approved: { classe: "bg-teal-50 text-teal-700", icone: Check },
  rejected: { classe: "bg-red-50 text-red-700", icone: AlertTriangle },
};

const ACCEPT = Object.keys(KYC_ACCEPTED).join(",");

export function DocumentManager({
  orgId,
  documents,
  canUpload,
}: {
  orgId: string;
  documents: KycDocument[];
  canUpload: boolean;
}) {
  return (
    <ul className="space-y-3">
      {KYC_TYPES.map((type) => (
        <DocumentRow
          key={type.value}
          orgId={orgId}
          type={type}
          documents={documents.filter((d) => d.type === type.value)}
          canUpload={canUpload}
        />
      ))}
    </ul>
  );
}

function DocumentRow({
  orgId,
  type,
  documents,
  canUpload,
}: {
  orgId: string;
  type: (typeof KYC_TYPES)[number];
  documents: KycDocument[];
  canUpload: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const pathRef = React.useRef<HTMLInputElement>(null);

  const [envoi, setEnvoi] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const [registre, enregistrer] = React.useActionState<KycState, FormData>(registerDocument, {});

  // La plus récente en tête : c'est elle qui fait foi.
  const triees = [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const courante = triees[0];
  const valide = courante?.status === "approved";

  async function envoyer(file: File | undefined) {
    if (!file) return;

    setErreur(null);

    const verdict = checkKycFile(file);
    if (!verdict.ok || !verdict.extension) {
      setErreur(verdict.reason ?? "Fichier refusé.");
      return;
    }

    setEnvoi(true);

    try {
      const supabase = createClient();
      const path = buildKycPath(orgId, type.value as KycDocumentType, verdict.extension);

      const { error } = await supabase.storage
        .from(KYC_BUCKET)
        // `upsert: false` : le nom porte un horodatage, donc chaque dépôt est
        // un fichier neuf. Remplacer un RIB ne doit pas effacer celui sur
        // lequel un versement a déjà été fait.
        .upload(path, file, { cacheControl: "0", upsert: false });

      if (error) {
        setErreur(
          error.message.toLowerCase().includes("policy")
            ? "Envoi refusé : seuls le propriétaire et le comptable de la structure peuvent déposer une pièce."
            : `Envoi impossible : ${error.message}`,
        );
        return;
      }

      if (pathRef.current) pathRef.current.value = path;
      formRef.current?.requestSubmit();
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4 transition-all duration-300">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <FileCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{type.label}</span>
            {courante ? <StatutBadge statut={courante.status} /> : null}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{type.hint}</p>

          {courante?.status === "rejected" && courante.rejectionReason ? (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900">
              <strong>À refaire :</strong> {courante.rejectionReason}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {courante ? <VoirBouton id={courante.id} /> : null}

          {courante && !valide ? <RetirerBouton id={courante.id} /> : null}

          {canUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => void envoyer(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant={courante ? "ghost" : "outline"}
                disabled={envoi}
                onClick={() => inputRef.current?.click()}
                className="h-9 px-3 text-xs"
              >
                {envoi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {courante ? "Remplacer" : "Déposer"}
                  </>
                )}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <form ref={formRef} action={enregistrer} className="hidden">
        <input type="hidden" name="type" value={type.value} />
        <input ref={pathRef} type="hidden" name="path" defaultValue="" />
      </form>

      {erreur ?? registre.error ? (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {erreur ?? registre.error}
        </p>
      ) : null}

      {registre.message ? (
        <p role="status" className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">
          {registre.message}
        </p>
      ) : null}
    </li>
  );
}

function StatutBadge({ statut }: { statut: KycStatus }) {
  const { classe, icone: Icone } = STATUTS[statut];

  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classe}`}
    >
      <Icone className="h-3 w-3" aria-hidden />
      {KYC_STATUS_LABELS[statut]}
    </span>
  );
}

function VoirBouton({ id }: { id: string }) {
  const [state, action, pending] = React.useActionState<KycState, FormData>(signDocument, {});

  // L'URL signée expire en une minute : on ouvre dès qu'elle arrive, plutôt
  // que de l'afficher et de laisser l'utilisateur la trouver périmée.
  React.useEffect(() => {
    if (state.url) window.open(state.url, "_blank", "noopener,noreferrer");
  }, [state.url]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" disabled={pending} className="h-9 px-3 text-xs">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <>
            <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Voir
          </>
        )}
      </Button>
    </form>
  );
}

function RetirerBouton({ id }: { id: string }) {
  const [state, action, pending] = React.useActionState<KycState, FormData>(removeDocument, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        aria-label="Retirer cette pièce"
        title={state.error ?? "Retirer cette pièce"}
        className="h-9 px-3 text-xs"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
    </form>
  );
}
