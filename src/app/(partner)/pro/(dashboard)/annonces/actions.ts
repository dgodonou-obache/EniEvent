"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSpace } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { BUCKET, MAX_PHOTOS, orgOfPath, publicUrl } from "@/lib/media";
import {
  fieldErrors,
  listingDetailsSchema,
  listingDraftSchema,
  optionalNumber,
  optionalText,
  pricingRuleSchema,
  serviceDetailsSchema,
  slugify,
  venueDetailsSchema,
} from "@/lib/validation/listing";
import { createClient } from "@/utils/supabase/server";

/**
 * Écritures du back-office partenaire.
 *
 * Règle constante : l'organisation vient **de la session**, jamais du
 * formulaire. Une Server Action est un point d'entrée réseau comme un autre —
 * accepter un `org_id` posté permettrait de publier au nom d'un concurrent.
 * La RLS refuserait l'écriture, mais on ne s'en remet pas à un seul rempart.
 */

export interface ActionState {
  errors?: Record<string, string>;
  message?: string;
}

async function requirePartnerOrg() {
  const { decision } = await requireSpace("partner", "/pro/connexion");

  if (!decision.granted || !decision.org) {
    // Ne devrait pas arriver : le layout a déjà filtré. Filet de sécurité si
    // l'action est appelée directement.
    throw new Error("Aucune organisation partenaire active.");
  }

  return decision.org.orgId;
}

/** Slug unique : deux « Salle Étoile » peuvent exister dans deux villes. */
async function uniqueSlug(base: string): Promise<string> {
  const supabase = await createClient();
  const root = slugify(base) || "annonce";

  const { data } = await supabase.from("listings").select("slug").like("slug", `${root}%`);
  const taken = new Set((data ?? []).map((r) => r.slug));

  if (!taken.has(root)) return root;

  let suffix = 2;
  while (taken.has(`${root}-${suffix}`)) suffix += 1;
  return `${root}-${suffix}`;
}

export async function createListing(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();

  const parsed = listingDraftSchema.safeParse({
    title: formData.get("title"),
    categoryId: formData.get("categoryId"),
    city: formData.get("city"),
    district: formData.get("district"),
    bookingMode: formData.get("bookingMode"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();

  // La nature de l'annonce découle de la catégorie : la demander au formulaire
  // permettrait de déclarer un traiteur comme lieu. La clé étrangère composite
  // le refuserait, mais autant ne pas poser la question.
  const { data: category } = await supabase
    .from("categories")
    .select("id, kind, parent_id")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();

  if (!category) return { errors: { categoryId: "Cette catégorie n'existe pas." } };

  if (category.parent_id === null) {
    return {
      errors: { categoryId: "Choisissez une catégorie précise, pas une famille." },
    };
  }

  const { data, error } = await supabase
    .from("listings")
    .insert({
      org_id: orgId,
      category_id: category.id,
      kind: category.kind,
      title: parsed.data.title,
      slug: await uniqueSlug(parsed.data.title),
      city: parsed.data.city,
      district: parsed.data.district || null,
      booking_mode: parsed.data.bookingMode,
      // Toute annonce naît en brouillon. Le déclencheur de modération refuse
      // d'ailleurs qu'un utilisateur crée directement une annonce validée.
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { message: `Création impossible : ${error.message}` };

  revalidatePath("/pro/annonces");
  redirect(`/pro/annonces/${data.id}`);
}

export async function updateListing(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");

  if (!listingId) return { message: "Annonce introuvable." };

  const draft = listingDraftSchema.safeParse({
    title: formData.get("title"),
    categoryId: formData.get("categoryId"),
    city: formData.get("city"),
    district: formData.get("district"),
    bookingMode: formData.get("bookingMode"),
  });

  const details = listingDetailsSchema.safeParse({
    description: optionalText(formData.get("description")),
    address: optionalText(formData.get("address")),
    paymentTerms: optionalText(formData.get("paymentTerms")),
    cancellationPolicyId: optionalText(formData.get("cancellationPolicyId")) ?? "",
    minPrice: optionalNumber(formData.get("minPrice")),
    minNoticeDays: optionalNumber(formData.get("minNoticeDays")),
  });

  if (!draft.success) return { errors: fieldErrors(draft.error) };
  if (!details.success) return { errors: fieldErrors(details.error) };

  const supabase = await createClient();

  const { error } = await supabase
    .from("listings")
    .update({
      title: draft.data.title,
      category_id: draft.data.categoryId,
      city: draft.data.city,
      district: draft.data.district || null,
      booking_mode: draft.data.bookingMode,
      description: details.data.description ?? null,
      address: details.data.address ?? null,
      payment_terms: details.data.paymentTerms ?? null,
      cancellation_policy_id: details.data.cancellationPolicyId || null,
      min_price: details.data.minPrice ?? null,
      min_notice_days: details.data.minNoticeDays ?? 0,
    })
    .eq("id", listingId)
    .eq("org_id", orgId)
    .select("id");

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  revalidatePath(`/pro/annonces/${listingId}`);
  revalidatePath("/pro/annonces");

  return { message: "Modifications enregistrées." };
}

export async function updateListingCapacity(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");
  const kind = String(formData.get("kind") ?? "");

  const supabase = await createClient();

  // On revérifie l'appartenance avant d'écrire dans les tables filles : leurs
  // politiques s'appuient sur l'annonce parente, autant échouer tôt et clair.
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!listing) return { message: "Annonce introuvable." };

  if (kind === "venue") {
    const parsed = venueDetailsSchema.safeParse({
      capacitySeated: optionalNumber(formData.get("capacitySeated")),
      capacityStanding: optionalNumber(formData.get("capacityStanding")),
      capacityCocktail: optionalNumber(formData.get("capacityCocktail")),
      surfaceM2: optionalNumber(formData.get("surfaceM2")),
      parkingSpots: optionalNumber(formData.get("parkingSpots")),
      noiseCurfewHour: optionalNumber(formData.get("noiseCurfewHour")),
      hasOutdoorSpace: formData.get("hasOutdoorSpace") === "on",
      hasKitchen: formData.get("hasKitchen") === "on",
      accessibilityPmr: formData.get("accessibilityPmr") === "on",
    });

    if (!parsed.success) return { errors: fieldErrors(parsed.error) };

    const { error } = await supabase.from("venue_details").upsert(
      {
        listing_id: listingId,
        capacity_seated: parsed.data.capacitySeated ?? null,
        capacity_standing: parsed.data.capacityStanding ?? null,
        capacity_cocktail: parsed.data.capacityCocktail ?? null,
        surface_m2: parsed.data.surfaceM2 ?? null,
        parking_spots: parsed.data.parkingSpots ?? null,
        noise_curfew_hour: parsed.data.noiseCurfewHour ?? null,
        has_outdoor_space: parsed.data.hasOutdoorSpace ?? false,
        has_kitchen: parsed.data.hasKitchen ?? false,
        accessibility_pmr: parsed.data.accessibilityPmr ?? false,
      },
      { onConflict: "listing_id" },
    );

    if (error) return { message: `Enregistrement impossible : ${error.message}` };
  } else {
    const parsed = serviceDetailsSchema.safeParse({
      minGuests: optionalNumber(formData.get("minGuests")),
      maxGuests: optionalNumber(formData.get("maxGuests")),
      travelRadiusKm: optionalNumber(formData.get("travelRadiusKm")),
      setupTimeMin: optionalNumber(formData.get("setupTimeMin")),
    });

    if (!parsed.success) return { errors: fieldErrors(parsed.error) };

    const { error } = await supabase.from("service_details").upsert(
      {
        listing_id: listingId,
        min_guests: parsed.data.minGuests ?? null,
        max_guests: parsed.data.maxGuests ?? null,
        travel_radius_km: parsed.data.travelRadiusKm ?? null,
        setup_time_min: parsed.data.setupTimeMin ?? null,
      },
      { onConflict: "listing_id" },
    );

    if (error) return { message: `Enregistrement impossible : ${error.message}` };
  }

  revalidatePath(`/pro/annonces/${listingId}`);
  return { message: "Modifications enregistrées." };
}

export async function setPricingRule(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");

  // L'unité vient d'un `<select>`, donc d'une chaîne quelconque : la valider
  // par le schéma évite d'insérer une valeur qui ferait échouer l'enum en base,
  // et couvre au passage le tarif et la majoration.
  const parsed = pricingRuleSchema.safeParse({
    unit: formData.get("unit"),
    basePrice: optionalNumber(formData.get("basePrice")),
    weekendMultiplier: optionalNumber(formData.get("weekendMultiplier")) ?? 1,
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { unit, basePrice, weekendMultiplier } = parsed.data;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!listing) return { message: "Annonce introuvable." };

  // Un seul tarif par unité : on remplace celui qui existe plutôt que d'en
  // empiler un second, sinon « à partir de » deviendrait imprévisible.
  await supabase.from("pricing_rules").delete().eq("listing_id", listingId).eq("unit", unit);

  const { error } = await supabase.from("pricing_rules").insert({
    listing_id: listingId,
    unit,
    base_price: basePrice,
    weekend_multiplier: weekendMultiplier,
  });

  if (error) return { message: `Tarif non enregistré : ${error.message}` };

  revalidatePath(`/pro/annonces/${listingId}`);
  return { message: "Tarif enregistré." };
}

/** Soumet l'annonce à la validation d'un administrateur. */
export async function submitForReview(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");

  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("id, title, description, city, price_from, status")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!listing) return { message: "Annonce introuvable." };

  // Contrôle de complétude côté serveur : une annonce sans tarif ni description
  // ferait perdre son temps au modérateur autant qu'au partenaire.
  const missing: string[] = [];
  if (!listing.description || listing.description.trim().length < 40) {
    missing.push("une description d'au moins 40 caractères");
  }
  if (listing.price_from == null) missing.push("au moins un tarif");

  if (missing.length > 0) {
    return { message: `Avant de soumettre, ajoutez ${missing.join(" et ")}.` };
  }

  const { error } = await supabase
    .from("listings")
    .update({ status: "pending" })
    .eq("id", listingId)
    .eq("org_id", orgId);

  if (error) return { message: `Soumission impossible : ${error.message}` };

  revalidatePath(`/pro/annonces/${listingId}`);
  revalidatePath("/pro/annonces");

  return { message: "Annonce soumise. Nos équipes la vérifient sous 48 h ouvrées." };
}

// -----------------------------------------------------------------------------
// Photos
//
// Le fichier lui-même ne passe pas par ici : le navigateur l'envoie directement
// au stockage, où les politiques vérifient que le chemin commence par
// l'organisation de l'utilisateur. Une photo de 5 Mo qui transiterait par le
// serveur Next doublerait le temps d'envoi sur une connexion mobile.
//
// Ces actions ne font que **tenir le registre** : la ligne dans `listing_media`,
// l'ordre, et la photo de couverture.
// -----------------------------------------------------------------------------

/** Vérifie l'appartenance et renvoie l'annonce, ou `null`. */
async function ownedListing(orgId: string, listingId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select("id, cover_url")
    .eq("id", listingId)
    .eq("org_id", orgId)
    .maybeSingle();

  return data;
}

/** Recalcule la couverture : la photo désignée, ou la première à défaut. */
async function refreshCover(listingId: string, orgId: string) {
  const supabase = await createClient();
  const env = publicEnv();

  const { data: media } = await supabase
    .from("listing_media")
    .select("storage_path")
    .eq("listing_id", listingId)
    .order("position")
    .limit(1);

  const first = media?.[0]?.storage_path ?? null;

  await supabase
    .from("listings")
    .update({ cover_url: first ? publicUrl(env.supabaseUrl, first) : null })
    .eq("id", listingId)
    .eq("org_id", orgId);
}

/** Enregistre une photo déjà déposée dans le stockage. */
export async function registerPhoto(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");
  const path = String(formData.get("path") ?? "");
  const alt = optionalText(formData.get("alt")) ?? null;

  if (!(await ownedListing(orgId, listingId))) return { message: "Annonce introuvable." };

  // Le chemin vient du client : on revérifie qu'il désigne bien cette annonce.
  // Les politiques de stockage ont déjà refusé une autre organisation, mais
  // rien ne les empêche de viser une autre annonce de la même organisation.
  if (orgOfPath(path) !== orgId || !path.startsWith(`${orgId}/${listingId}/`)) {
    return { message: "Chemin de photo invalide." };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("listing_media")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);

  if ((count ?? 0) >= MAX_PHOTOS) {
    return { message: `${MAX_PHOTOS} photos au maximum par annonce.` };
  }

  // La position est l'ordre d'arrivée. `unique (listing_id, position)` interdit
  // les doublons : on repart du plus grand rang existant, pas du décompte, pour
  // qu'une suppression ne provoque pas de collision.
  const { data: last } = await supabase
    .from("listing_media")
    .select("position")
    .eq("listing_id", listingId)
    .order("position", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("listing_media").insert({
    listing_id: listingId,
    storage_path: path,
    alt,
    position: (last?.[0]?.position ?? -1) + 1,
  });

  if (error) return { message: `Photo non enregistrée : ${error.message}` };

  await refreshCover(listingId, orgId);
  revalidatePath(`/pro/annonces/${listingId}`);
  revalidatePath("/pro/annonces");

  return { message: "Photo ajoutée." };
}

export async function removePhoto(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");

  const listing = await ownedListing(orgId, listingId);
  if (!listing) return { message: "Annonce introuvable." };

  const supabase = await createClient();

  const { data: removed, error } = await supabase
    .from("listing_media")
    .delete()
    .eq("id", mediaId)
    .eq("listing_id", listingId)
    .select("storage_path");

  if (error) return { message: `Suppression impossible : ${error.message}` };
  if (!removed || removed.length === 0) return { message: "Photo introuvable." };

  // Le fichier part aussi : le laisser encombrerait le stockage sans que rien
  // ne le référence plus.
  await supabase.storage.from(BUCKET).remove([removed[0].storage_path]);

  await refreshCover(listingId, orgId);
  revalidatePath(`/pro/annonces/${listingId}`);
  revalidatePath("/pro/annonces");

  return { message: "Photo retirée." };
}

/** Désigne la photo de couverture, sans renuméroter les autres. */
export async function setCoverPhoto(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");

  if (!(await ownedListing(orgId, listingId))) return { message: "Annonce introuvable." };

  const supabase = await createClient();
  const env = publicEnv();

  const { data: media } = await supabase
    .from("listing_media")
    .select("storage_path")
    .eq("id", mediaId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (!media) return { message: "Photo introuvable." };

  const { data, error } = await supabase
    .from("listings")
    .update({ cover_url: publicUrl(env.supabaseUrl, media.storage_path) })
    .eq("id", listingId)
    .eq("org_id", orgId)
    .select("id");

  if (error) return { message: `Action impossible : ${error.message}` };
  if (!data || data.length === 0) return { message: "Annonce introuvable." };

  revalidatePath(`/pro/annonces/${listingId}`);
  revalidatePath("/pro/annonces");

  return { message: "Photo de couverture mise à jour." };
}

/** Met en pause ou remet en ligne — sans repasser par la modération. */
export async function togglePause(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = await requirePartnerOrg();
  const listingId = String(formData.get("listingId") ?? "");
  const paused = formData.get("paused") === "true";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .update({ is_paused: paused })
    .eq("id", listingId)
    .eq("org_id", orgId)
    .select("id");

  if (error) return { message: `Action impossible : ${error.message}` };

  // Rappel : une ligne masquée par la RLS ne lève pas d'erreur, l'UPDATE touche
  // simplement 0 ligne. Vérifier le compte est le seul moyen de le détecter.
  if (!data || data.length === 0) return { message: "Annonce introuvable." };

  revalidatePath("/pro/annonces");
  return { message: paused ? "Annonce mise en pause." : "Annonce remise en ligne." };
}
