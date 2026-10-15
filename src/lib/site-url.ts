/**
 * L'adresse publique du site, résolue au même endroit pour tout le monde.
 *
 * ⚠️ Elle était recopiée **mot pour mot** dans les deux tunnels de paiement,
 * avec le même repli `https://enievent.com` — deux endroits à corriger le jour
 * où le domaine change, et un seul qu'on penserait à modifier. Le repli
 * compte : `robots.txt` et le plan de site **doivent** porter des adresses
 * absolues, et une variable absente y produirait des liens vers `undefined`
 * sans lever d'erreur.
 *
 * ⚠️ `/api/cron/notifications` garde volontairement **un autre repli** — l'URL
 * Supabase — et n'a pas été ramené ici. Ce n'est pas un oubli : changer le
 * repli d'un courriel déjà en file changerait les liens qu'il contient, et
 * cela se décide à part.
 *
 * ⚠️ `NEXT_PUBLIC_SITE_URL` vaut `localhost` en développement. C'est voulu —
 * les tunnels de paiement y renvoient le navigateur — mais cela signifie qu'un
 * plan de site généré en local pointe vers `localhost`. Il n'est servi qu'en
 * production, où la variable porte le vrai domaine.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://enievent.com").replace(/\/+$/, "");
}
