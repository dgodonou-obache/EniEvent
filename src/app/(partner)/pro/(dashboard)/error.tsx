"use client";

import { SessionExpiree } from "@/components/auth/SessionExpiree";

/**
 * Frontière d'erreur de l'espace partenaire.
 *
 * ⚠️ **Elle existe pour une raison précise** : sans `error.tsx`, Next affiche
 * son écran intégré — « This page couldn't load » —, que l'utilisateur lit
 * comme une panne d'ÉniEvent alors qu'il vient simplement d'être déconnecté.
 *
 * Le diagnostic n'est pas fait ici : `SessionExpiree` interroge
 * `/api/session` avant d'affirmer quoi que ce soit. Annoncer une session
 * expirée sur une vraie panne serait reproduire le défaut qu'on corrige, dans
 * l'autre sens.
 *
 * La destination est celle de **cet** espace : un partenaire déconnecté ne part
 * jamais sur `/connexion` (§4 du guide).
 */
export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return <SessionExpiree signInTo="/pro/connexion" reset={reset} />;
}
