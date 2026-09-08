"use client";

import * as React from "react";
import Link from "next/link";
import type { Map as LeafletMap, Marker } from "leaflet";

import { format, money, DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/money";

import { listingHref, type ListingCardData } from "./ListingCard";

interface MapListing extends ListingCardData {
  latitude?: number | null;
  longitude?: number | null;
}

/** Centre du Bénin littoral, là où se concentre l'offre. */
const DEFAULT_CENTER: [number, number] = [6.37, 2.39];

/**
 * Carte des résultats.
 *
 * Leaflet et OpenStreetMap : aucune clé d'API à obtenir ni à faire tourner,
 * contrairement à Mapbox ou Google Maps. La bibliothèque touche directement au
 * DOM et à `window`, d'où l'import dynamique côté client uniquement.
 */
export function ResultsMap({ listings }: { listings: MapListing[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);
  const [ready, setReady] = React.useState(false);

  const located = React.useMemo(
    () => listings.filter((l) => l.latitude != null && l.longitude != null),
    [listings],
  );

  React.useEffect(() => {
    let cancelled = false;
    let markers: Marker[] = [];

    async function draw() {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          scrollWheelZoom: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 18,
        }).addTo(mapRef.current);

        setReady(true);
      }

      const map = mapRef.current;

      for (const listing of located) {
        const marker = L.marker([listing.latitude!, listing.longitude!], {
          icon: L.divIcon({
            className: "",
            html: priceMarker(listing),
            iconSize: [0, 0],
          }),
        }).addTo(map);
        markers.push(marker);
      }

      if (located.length > 0) {
        map.fitBounds(
          located.map((l) => [l.latitude!, l.longitude!] as [number, number]),
          { padding: [40, 40], maxZoom: 14 },
        );
      }
    }

    draw();

    return () => {
      cancelled = true;
      for (const marker of markers) marker.remove();
      markers = [];
    };
  }, [located]);

  React.useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (located.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-2xl border border-slate-100 bg-white text-center text-sm text-slate-500">
        <p className="max-w-xs px-6">
          Aucun résultat n&apos;est localisé sur la carte. Les prestations de service
          n&apos;ont pas d&apos;adresse fixe&nbsp;: basculez en vue liste pour les voir.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100">
      <div ref={containerRef} className="h-[480px] w-full bg-slate-100" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-sm text-slate-500">
          Chargement de la carte…
        </div>
      ) : null}

      {/* Les repères sont du HTML injecté par Leaflet : la navigation clavier
          passe par cette liste, qui reste accessible aux lecteurs d'écran. */}
      <ul className="sr-only">
        {located.map((listing) => (
          <li key={listing.slug}>
            <Link href={listingHref(listing)}>
              {listing.title} — {listing.city}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function priceMarker(listing: MapListing): string {
  const currency = (listing.currency ?? DEFAULT_CURRENCY) as CurrencyCode;
  const label =
    listing.price_from != null
      ? format(money(listing.price_from, currency), { withCurrency: false })
      : "Devis";

  const href = listingHref(listing);
  const title = escapeHtml(listing.title);

  return `<a href="${href}" title="${title}" class="inline-block -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-200 bg-white px-2.5 py-1 text-xs font-bold text-orange-600 shadow-sm hover:bg-orange-50">${escapeHtml(label)}</a>`;
}

/** Le titre vient de la base : il ne doit pas pouvoir injecter du balisage. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
