'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { loadGoogleMaps } from '@/lib/maps/loadGoogleMaps';
import type { RoomSummary } from '@/components/features/rooms/RoomListingCard';

const BAKU_CENTER = { lat: 40.3777, lng: 49.8516 };

export interface SearchResultsMapProps {
  rooms: RoomSummary[];
  highlightedRoomId: string | undefined;
  onMarkerHover: (roomId: string | undefined) => void;
  onMarkerClick: (roomId: string) => void;
  className?: string;
}

/**
 * 15_MAPS_ARCHITECTURE.md §15.1's "highest-volume use case": the search
 * results map, lazy-loaded (never on the homepage) and driven entirely
 * by `lat`/`lng` now present on `RoomSummary` (added this pass — see
 * PHASE4_REPORT.md for why that was a real backend gap, not spec drift).
 * Distance itself is never recomputed client-side (§15.1: PostGIS
 * `ST_Distance` server-side, never a billed Google Distance Matrix call)
 * — this component only places markers and reads `distanceKm` the
 * backend already computed.
 *
 * Uses the classic `google.maps.Marker` API (not `AdvancedMarkerElement`)
 * deliberately — the advanced marker needs a Map ID provisioned in
 * Google Cloud Console, an extra setup step with no functional benefit
 * for a V1 pin-and-info-window map.
 *
 * Gracefully degrades to a placeholder when
 * `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` isn't set (true in this sandbox —
 * no `.env.local` exists here) rather than throwing or rendering a
 * broken grey box.
 */
export function SearchResultsMap({ rooms, highlightedRoomId, onMarkerHover, onMarkerClick, className }: SearchResultsMapProps) {
  const t = useTranslations('search');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return undefined;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: BAKU_CENTER,
          zoom: 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
      })
      .catch((err) => {
        // A network/script-load failure here is a runtime condition, not
        // a code defect — logged rather than surfaced as a page error,
        // since the list of results is still fully usable without a map.
        console.error('Failed to load Google Maps:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Rebuild markers whenever the result set changes. Search pages return
  // at most `pageSize` (<=100) rooms at a time, so a full clear-and-redraw
  // per page is simple and cheap — no incremental diffing needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !apiKey) return undefined;

    for (const marker of markersRef.current.values()) marker.setMap(null);
    markersRef.current.clear();

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;

    for (const room of rooms) {
      if (!room.id || room.lat === undefined || room.lat === null || room.lng === undefined || room.lng === null) continue;
      const position = { lat: room.lat, lng: room.lng };
      const marker = new google.maps.Marker({
        map,
        position,
        title: room.name,
      });
      marker.addListener('mouseover', () => onMarkerHover(room.id));
      marker.addListener('mouseout', () => onMarkerHover(undefined));
      marker.addListener('click', () => onMarkerClick(room.id!));
      markersRef.current.set(room.id, marker);
      bounds.extend(position);
      hasPoint = true;
    }

    if (hasPoint) map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMarkerHover/onMarkerClick are re-created each render by the parent; re-subscribing per-room on every render would thrash Maps listeners for no behavioral benefit.
  }, [rooms, apiKey]);

  // Reflect hover/selection sync from the list side (§8.6: "Synced list +
  // map split view") by bumping the highlighted marker's zIndex so it
  // draws above its neighbors — a full icon swap needs custom marker
  // images this pass doesn't build.
  useEffect(() => {
    for (const [roomId, marker] of markersRef.current.entries()) {
      marker.setZIndex(roomId === highlightedRoomId ? 999 : undefined);
      marker.setAnimation(roomId === highlightedRoomId ? google.maps.Animation.BOUNCE : null);
    }
  }, [highlightedRoomId]);

  if (!apiKey) {
    return (
      <div
        className={[
          'flex items-center justify-center rounded-lg border border-dashed border-border bg-surface-elevated p-6 text-center text-small text-text-muted',
          className ?? '',
        ].join(' ')}
      >
        {t('mapUnavailable')}
      </div>
    );
  }

  return <div ref={containerRef} role="application" aria-label={t('mapViewToggle')} className={['rounded-lg', className ?? ''].join(' ')} />;
}
