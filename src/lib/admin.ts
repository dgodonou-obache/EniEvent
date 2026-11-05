import "server-only";

import { KYC_REQUIRED } from "@/lib/validation/partner";
import type { Database } from "@/types/database";
import { createClient } from "@/utils/supabase/server";

/** Lectures du back-office ÉniEvent. La RLS n'ouvre ces vues qu'aux administrateurs. */

export async function getModerationQueue() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `id, slug, title, description, city, district, kind, status, price_from, min_price,
       payment_terms, updated_at, cover_url,
       categories(name),
       organizations(slug, brand_name, legal_name, city, partner_profiles(is_verified)),
       venue_details(capacity_seated, capacity_standing),
       service_details(min_guests, max_guests),
       pricing_rules(unit, base_price)`,
    )
    .eq("status", "pending")
    // Les plus anciennes d'abord : un partenaire qui attend depuis trois jours
    // passe avant celui qui vient de soumettre.
    .order("updated_at", { ascending: true });

  if (error) throw new Error(`File de modération illisible : ${error.message}`);

  return data ?? [];
}

export type ModerationItem = Awaited<ReturnType<typeof getModerationQueue>>[number];

export async function getAdminOverview() {
  const supabase = await createClient();

  const [pending, approved, partners, piecesEnAttente] = await Promise.all([
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("is_paused", false),
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("type", "partner"),
    // ⚠️ **Les pièces réellement déposées et pas encore tranchées**, et non
    // `partner_profiles.is_verified = false`. La tuile comptait ce drapeau et
    // s'intitulait « Dossiers KYC à vérifier » : elle annonçait quatre dossiers
    // alors que la base n'en contenait aucun — ces quatre structures n'avaient
    // jamais rien déposé. Un chiffre qui désigne autre chose que ce que dit son
    // libellé envoie l'exploitant chercher un travail qui n'existe pas.
    supabase
      .from("kyc_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    pending: pending.count ?? 0,
    published: approved.count ?? 0,
    partners: partners.count ?? 0,
    kycPending: piecesEnAttente.count ?? 0,
  };
}

/** Les états d'une demande, tels que les nomme l'énumération Postgres. */
export type RequestStatus = Database["public"]["Enums"]["quote_request_status"];

/**
 * Tous les appels d'offres de la plateforme.
 *
 * L'administration n'a pas ici de décision à prendre — la RLS lui ouvre les
 * demandes en lecture, pas les devis des partenaires, qui restent scellés
 * jusqu'à leur envoi. L'écran sert à **voir ce qui se grippe** : une demande
 * ouverte depuis trois jours sans la moindre offre, une échéance dépassée, un
 * appel d'offres attribué qu'on peut citer en exemple.
 *
 * On compte les offres reçues sans en révéler le contenu : c'est le seul
 * chiffre nécessaire pour repérer une demande qui n'intéresse personne.
 *
 * ⚠️ **Un devis ne se rattache pas à la demande, mais à l'une de ses
 * prestations** (`quotes.item_id`). `quotes(count)` depuis `quote_requests`
 * échoue donc — « no relationship found » — et le comptage passe par les
 * items. Deux clés étrangères relient `quotes` et `quote_request_items` : sans
 * l'indication `!quotes_item_id_fkey`, PostgREST refuse de choisir. La même
 * convention vit dans `quotes.ts` sous le nom `BY_ITEM`.
 */
export async function getAllRequests(status?: RequestStatus) {
  const supabase = await createClient();

  let query = supabase
    .from("quote_requests")
    .select(
      `id, reference, title, event_type, event_date, city, guests, budget_max, currency,
       status, respond_by, published_at, created_at,
       profiles:requester_id(full_name),
       organizations(brand_name, legal_name),
       quote_request_items(id, categories(name), quotes!quotes_item_id_fkey(count))`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) throw new Error(`Demandes illisibles : ${error.message}`);

  return data ?? [];
}

export type AdminRequest = Awaited<ReturnType<typeof getAllRequests>>[number];

/** Compteurs par état, pour les onglets de filtrage. */
export async function getRequestCounts() {
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_requests").select("status, respond_by");

  if (error) throw new Error(`Compteurs illisibles : ${error.message}`);

  const maintenant = Date.now();

  return {
    // Rendu à l'appelant : comparer des échéances exige un instant de
    // référence, et `Date.now()` est interdit dans le rendu d'un composant.
    maintenant,
    total: data.length,
    open: data.filter((r) => r.status === "open").length,
    awarded: data.filter((r) => r.status === "awarded").length,
    // Une échéance dépassée alors que la demande est encore ouverte : le client
    // attend une réponse que le système ne réclamera jamais.
    enRetard: data.filter(
      (r) => r.status === "open" && r.respond_by != null && new Date(r.respond_by).getTime() < maintenant,
    ).length,
  };
}

export interface CommissionRow {
  orgId: string;
  orgName: string;
  city: string | null;
  status: Database["public"]["Enums"]["org_status"];
  isVerified: boolean;
  listingsCount: number;
  /** Taux propre à ce partenaire, ou `null` s'il suit le barème général. */
  override: number | null;
  /** Ce qui s'appliquera réellement à sa prochaine commande. */
  effective: number;
}

export interface CommissionSettings {
  /** Barème appliqué aux partenaires sans taux propre. */
  defaultRate: number;
  partners: CommissionRow[];
}

/**
 * Barèmes de commission, pour l'administration.
 *
 * **Le taux propre et le taux effectif sont rendus séparément**, et c'est le
 * point de l'écran : « 12 % » sans son origine se lit comme un réglage qu'on a
 * fait soi-même, alors qu'il peut être hérité du barème général. Les deux
 * valeurs viennent de `commission_settings()` (migration 0034), qui refuse de
 * répondre à qui n'est pas administrateur.
 */
export async function getCommissionSettings(): Promise<CommissionSettings> {
  const supabase = await createClient();

  const [{ data: rows }, { data: parDefaut }] = await Promise.all([
    supabase.rpc("commission_settings"),
    supabase.rpc("default_commission_rate"),
  ]);

  return {
    defaultRate: Number(parDefaut ?? 10),
    partners: (rows ?? []).map((r) => ({
      orgId: r.org_id,
      orgName: r.org_name ?? "Partenaire",
      city: r.city,
      status: r.status,
      isVerified: r.is_verified,
      listingsCount: r.listings_count,
      override: r.rate_override === null ? null : Number(r.rate_override),
      effective: Number(r.effective_rate),
    })),
  };
}

// =============================================================================
// Lot C — comptes, référentiel, exploitation
// =============================================================================

export type AccountType = Database["public"]["Enums"]["account_type"];
export type OrgStatus = Database["public"]["Enums"]["org_status"];

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  accountType: AccountType;
  /** Faux tant que l'utilisateur n'a pas cliqué le lien reçu. */
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  orgCount: number;
}

/**
 * Les comptes, adresse comprise.
 *
 * ⚠️ L'adresse ne vient **pas** de `profiles`, qui n'en porte aucune : elle
 * vit dans `auth.users`, que PostgREST n'expose pas. `admin_users` (migration
 * 0040) l'en extrait derrière `app.is_admin()`. C'est aussi pour cela que la
 * recherche se fait en base et non ici : filtrer côté applicatif supposerait
 * d'avoir déjà tout chargé.
 */
export async function getAdminUsers(recherche?: string, limite = 50): Promise<AdminUser[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_users", {
    recherche: recherche?.trim() || undefined,
    limite,
  });

  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email ?? "",
    fullName: r.full_name,
    phone: r.phone,
    accountType: r.account_type,
    emailConfirmed: r.email_confirmed ?? false,
    lastSignInAt: r.last_sign_in_at,
    createdAt: r.created_at,
    orgCount: r.org_count ?? 0,
  }));
}

export interface AdminCompany {
  orgId: string;
  legalName: string;
  brandName: string | null;
  city: string | null;
  status: OrgStatus;
  billingEmail: string | null;
  phone: string | null;
  memberCount: number;
  createdAt: string;
}

/**
 * Les entreprises clientes. Le pendant de `/admin/partenaires`, côté acheteur.
 *
 * ⚠️ **Pas de lecture directe de `organizations` ici**, et ce n'est pas un
 * détour gratuit : la migration 0036 a fermé l'annuaire, et `billing_email`
 * comme `phone` sont hors du `grant` de colonnes. Un administrateur étant
 * `authenticated` comme les autres, la requête directe répond
 * `permission denied` — constaté en rendant l'écran, jamais par `tsc`.
 * `admin_companies()` (migration 0040) est le chemin prévu.
 */
export async function getAdminCompanies(): Promise<AdminCompany[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_companies");

  if (error) throw new Error(`Lecture des entreprises impossible : ${error.message}`);

  return (data ?? []).map((o) => ({
    orgId: o.org_id,
    legalName: o.legal_name,
    brandName: o.brand_name,
    city: o.city,
    status: o.status,
    billingEmail: o.billing_email,
    phone: o.phone,
    memberCount: o.member_count ?? 0,
    createdAt: o.created_at,
  }));
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  kind: Database["public"]["Enums"]["category_kind"];
  isActive: boolean;
  sortOrder: number;
  /** Nombre d'annonces : on ne désactive pas une catégorie à l'aveugle. */
  listingCount: number;
}

export async function getAdminCategories(): Promise<AdminCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, kind, is_active, sort_order, listings(count)")
    .order("kind")
    .order("sort_order");

  if (error) throw new Error(`Lecture des catégories impossible : ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: String(c.slug),
    kind: c.kind,
    isActive: c.is_active,
    sortOrder: c.sort_order,
    listingCount: c.listings?.[0]?.count ?? 0,
  }));
}

export interface AdminCity {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  isActive: boolean;
  sortOrder: number;
  listingCount: number;
}

export async function getAdminCities(): Promise<AdminCity[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cities")
    .select("id, name, slug, region, is_active, sort_order")
    .eq("country", "BJ")
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Lecture des villes impossible : ${error.message}`);

  // ⚠️ Les annonces portent le **nom** de la ville en texte, pas une clé
  // étrangère : le comptage se fait donc par nom. Renommer une ville sans
  // renommer ses annonces les détacherait — c'est dit à l'écran.
  const { data: listings } = await supabase
    .from("listings")
    .select("city")
    .eq("status", "approved");

  const parVille = new Map<string, number>();
  for (const l of listings ?? []) {
    if (l.city) parVille.set(l.city, (parVille.get(l.city) ?? 0) + 1);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: String(c.slug),
    region: c.region,
    isActive: c.is_active,
    sortOrder: c.sort_order,
    listingCount: parVille.get(c.name) ?? 0,
  }));
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  fromState: string | null;
  toState: string | null;
  createdAt: string;
}

/**
 * Le journal d'audit.
 *
 * **Il ne se lit pas comme une liste, mais comme une enquête** : on y vient
 * avec une question — qui a validé cette annonce, quand ce taux a-t-il changé.
 * D'où le filtre par type d'entité, et l'ordre antichronologique.
 */
export async function getAuditLog(entityType?: string, limite = 100): Promise<AuditEntry[]> {
  const supabase = await createClient();

  let requete = supabase
    .from("audit_logs")
    .select("id, actor_id, entity_type, entity_id, action, from_state, to_state, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (entityType) requete = requete.eq("entity_type", entityType);

  const { data, error } = await requete;

  if (error) throw new Error(`Lecture du journal impossible : ${error.message}`);

  // Le nom de l'auteur se résout en un second appel plutôt qu'en jointure :
  // `audit_logs.actor_id` ne porte aucune clé étrangère déclarée vers
  // `profiles`, PostgREST ne saurait donc pas l'imbriquer.
  const ids = [...new Set((data ?? []).map((e) => e.actor_id).filter((x): x is string => !!x))];
  const noms = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data: profils } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profils ?? []) noms.set(p.id, p.full_name);
  }

  return (data ?? []).map((e) => ({
    id: e.id,
    actorId: e.actor_id,
    actorName: e.actor_id ? (noms.get(e.actor_id) ?? null) : null,
    entityType: e.entity_type,
    entityId: e.entity_id,
    action: e.action,
    fromState: e.from_state,
    toState: e.to_state,
    createdAt: e.created_at,
  }));
}

/** Les types d'entité réellement présents : n'offrir que des filtres qui rendent quelque chose. */
export async function getAuditEntityTypes(): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("audit_logs")
    .select("entity_type")
    .order("entity_type")
    .limit(2000);

  return [...new Set((data ?? []).map((e) => e.entity_type))].sort();
}

export interface AdminReport {
  /** Début de la fenêtre observée, en ISO. */
  since: string;
  days: number;
  currency: string;
  /** Ce que les clients ont réellement réglé. */
  collected: number;
  /** La part de la plateforme sur cet encaissement. C'est le seul revenu. */
  commission: number;
  /** Ce qui revient aux partenaires. `collected = commission + partnerDue`. */
  partnerDue: number;
  refunded: number;
  ordersCreated: number;
  ordersCancelled: number;
  newAccounts: number;
  newPartners: number;
  listingsPublished: number;
}

/**
 * Les chiffres de la période.
 *
 * ⚠️ **On compte l'encaissé, pas le commandé.** Une commande ouverte n'est pas
 * un revenu : elle peut rester impayée, ou être annulée. Le seul chiffre qui
 * engage la plateforme est ce que les clients ont réglé — d'où la lecture de
 * `payments` à l'état `paid` plutôt que du total des commandes.
 *
 * La ventilation n'est **pas recalculée ici** : `payments.commission` et
 * `payments.partner_due` sont écrits à l'encaissement, sous une contrainte qui
 * garantit `commission + partner_due = amount`. Les réadditionner d'une règle
 * de trois ferait diverger le rapport de la réalité comptable au franc près.
 */
export async function getAdminReport(days = 30): Promise<AdminReport> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [encaissements, remboursements, commandes, comptes, partenaires, annonces] =
    await Promise.all([
      supabase
        .from("payments")
        .select("amount, commission, partner_due, currency")
        .eq("status", "paid")
        .gte("created_at", since),
      supabase.from("refunds").select("amount").gte("created_at", since),
      supabase.from("orders").select("status").gte("created_at", since),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("type", "partner")
        .gte("created_at", since),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .gte("created_at", since),
    ]);

  const lignes = encaissements.data ?? [];

  return {
    since,
    days,
    currency: lignes[0]?.currency ?? "XOF",
    collected: lignes.reduce((t, p) => t + p.amount, 0),
    commission: lignes.reduce((t, p) => t + p.commission, 0),
    partnerDue: lignes.reduce((t, p) => t + p.partner_due, 0),
    refunded: (remboursements.data ?? []).reduce((t, r) => t + r.amount, 0),
    ordersCreated: (commandes.data ?? []).length,
    ordersCancelled: (commandes.data ?? []).filter(
      (o) => o.status === "cancelled" || o.status === "refunded",
    ).length,
    newAccounts: comptes.count ?? 0,
    newPartners: partenaires.count ?? 0,
    listingsPublished: annonces.count ?? 0,
  };
}

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, label, description, enabled, updated_at")
    .order("key");

  if (error) throw new Error(`Lecture des interrupteurs impossible : ${error.message}`);

  return (data ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    enabled: f.enabled,
    updatedAt: f.updated_at,
  }));
}

// -----------------------------------------------------------------------------
// Dossiers des partenaires
// -----------------------------------------------------------------------------

export interface KycPiece {
  id: string;
  type: string;
  status: Database["public"]["Enums"]["kyc_status"];
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface KycDossier {
  orgId: string;
  name: string;
  city: string | null;
  /** Vrai quand chaque pièce obligatoire a une version approuvée. */
  verified: boolean;
  /** Pièces obligatoires encore sans version approuvée. */
  missing: string[];
  pieces: KycPiece[];
  /** Pièces déposées et pas encore tranchées : ce qui appelle une décision. */
  pending: number;
  /** Nombre d'annonces que la validation du dossier débloquerait. */
  listingsWaiting: number;
}

/**
 * Les dossiers des partenaires, pour l'écran de contrôle.
 *
 * ⚠️ **Toutes les structures, pas seulement celles qui ont déposé.** Un écran
 * qui ne montre que les dossiers commencés laisse invisibles exactement ceux
 * qu'il faut relancer — et c'est là qu'était le trou : la tuile du tableau de
 * bord annonçait « 4 dossiers à vérifier » alors que ces quatre structures
 * n'avaient **rien** déposé. On compte donc aussi ce que chacune n'a pas fait.
 *
 * ⚠️ **Aucune URL de fichier ici.** Le seau est privé : une adresse ne s'obtient
 * que par une URL signée d'une minute, émise à la demande dans l'action
 * `signKycDocument`. La faire figurer dans la charge de la page la ferait
 * voyager dans les journaux et les caches.
 */
export async function getKycDossiers(): Promise<KycDossier[]> {
  const supabase = await createClient();

  const [orgs, pieces, annonces] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, brand_name, city, partner_profiles(is_verified)")
      .eq("type", "partner")
      .order("legal_name"),
    supabase
      .from("kyc_documents")
      .select("id, org_id, type, status, rejection_reason, created_at, reviewed_at")
      .order("created_at", { ascending: false }),
    supabase.from("listings").select("id, org_id").eq("status", "pending"),
  ]);

  if (orgs.error) throw new Error(`Partenaires illisibles : ${orgs.error.message}`);

  const parOrg = new Map<string, KycPiece[]>();
  for (const p of pieces.data ?? []) {
    const liste = parOrg.get(p.org_id) ?? [];
    liste.push({
      id: p.id,
      type: p.type,
      status: p.status,
      rejectionReason: p.rejection_reason,
      createdAt: p.created_at,
      reviewedAt: p.reviewed_at,
    });
    parOrg.set(p.org_id, liste);
  }

  const enAttente = new Map<string, number>();
  for (const l of annonces.data ?? []) {
    enAttente.set(l.org_id, (enAttente.get(l.org_id) ?? 0) + 1);
  }

  return (orgs.data ?? []).map((o) => {
    const liste = parOrg.get(o.id) ?? [];
    const approuvees = new Set(liste.filter((p) => p.status === "approved").map((p) => p.type));
    const profil = Array.isArray(o.partner_profiles) ? o.partner_profiles[0] : o.partner_profiles;

    return {
      orgId: o.id,
      name: o.brand_name ?? o.legal_name,
      city: o.city,
      verified: profil?.is_verified ?? false,
      missing: KYC_REQUIRED.filter((t) => !approuvees.has(t)),
      pieces: liste,
      pending: liste.filter((p) => p.status === "pending").length,
      listingsWaiting: enAttente.get(o.id) ?? 0,
    };
  });
}
