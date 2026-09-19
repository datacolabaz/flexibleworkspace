'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { loadMapboxGl } from '@/lib/maps/loadMapbox';
import type mapboxgl from 'mapbox-gl';
import type { RoomSummary } from '@/components/features/rooms/RoomListingCard';

// Mapbox center/bounds are [lng, lat] — the reverse of the {lat, lng}
// shape the rest of this app (and Google Maps) uses.
const BAKU_CENTER: [number, number] = [49.8516, 40.3777];

export interface SearchResultsMapProps {
  rooms: RoomSummary[];
  highlightedRoomId: string | undefined;
  onMarkerHover: (roomId: string | undefined) => void;
  onMarkerClick: (roomId: string) => void;
  className?: string;
}

/**
 * `15_MAPS_ARCHITECTURE.md` §15.1's "highest-volume use case": the search
 * results map, lazy-loaded (never on the homepage) and driven entirely by
 * `lat`/`lng` on `RoomSummary`. Distance itself is never recomputed
 * client-side (§15.1: PostGIS `ST_Distance` server-side, never a billed
 * distance-matrix call) — this component only places markers and reads
 * `distanceKm` the backend already computed.
 *
 * Each marker is a custom DOM element (`.spotva-map-marker`, styled in
 * `globals.css`) rather than Mapbox's default pin, so the highlighted/
 * hover state (`.spotva-map-marker--active`) can be toggled with a plain
 * CSS class instead of swapping marker images — the same "no extra setup
 * for a V1 pin-and-info-window map" reasoning the Google Maps version
 * used for skipping `AdvancedMarkerElement`.
 *
 * Gracefully degrades to a placeholder when `NEXT_PUBLIC_MAPBOX_TOKEN`
 * isn't set rather than throwing or rendering a broken grey box.
 */
export function SearchResultsMap({ rooms, highlightedRoomId, onMarkerHover, onMarkerClick, className }: SearchResultsMapProps) {
  const t = useTranslations('search');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Create the map once per mount.
  useEffect(() => {
    if (!accessToken || !containerRef.current) return undefined;
    let cancelled = false;

    loadMapboxGl(accessToken)
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: BAKU_CENTER,
          zoom: 11,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
      })
      .catch((err) => {
        // A network/script-load failure here is a runtime condition, not
        // a code defect — logged rather than surfaced as a page error,
        // since the list of results is still fully usable without a map.
        console.error('Failed to load Mapbox GL:', err);
      });

    return () => {
      cancelled = true;
      // markersRef.current is a plain mutable Map this component owns
      // (not a React-managed DOM ref), and unmount cleanup deliberately
      // reads whatever markers the second effect below has added by
      // then — not a snapshot taken when this effect first ran, when the
      // Map is still empty. eslint-disable-next-line addresses the
      // react-hooks rule's usual DOM-ref concern, which doesn't apply here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map instance is created once per mount; accessToken changing mid-session isn't a case this app hits.
  }, []);

  // Rebuild markers whenever the result set changes. Search pages return
  // at most `pageSize` (<=100) rooms at a time, so a full clear-and-redraw
  // per page is simple and cheap — no incremental diffing needed.
  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    loadMapboxGl(accessToken).then((mapboxgl) => {
      const map = mapRef.current;
      if (cancelled || !map) return;

      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();

      const bounds = new mapboxgl.LngLatBounds();
      let hasPoint = false;

      for (const room of rooms) {
        if (!room.id || room.lat === undefined || room.lat === null || room.lng === undefined || room.lng === null) continue;
        const position: [number, number] = [room.lng, room.lat];

        const el = document.createElement('div');
        el.className = 'spotva-map-marker';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', room.name ?? t('untitledRoom'));

        const marker = new mapboxgl.Marker({ element: el }).setLngLat(position).addTo(map);

        el.addEventListener('mouseenter', () => onMarkerHover(room.id));
        el.addEventListener('mouseleave', () => onMarkerHover(undefined));
        el.addEventListener('click', () => onMarkerClick(room.id!));

        markersRef.current.set(room.id, marker);
        bounds.extend(position);
        hasPoint = true;
      }

      if (hasPoint) map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMarkerHover/onMarkerClick are re-created each render by the parent; re-subscribing per-room on every render would thrash listeners for no behavioral benefit.
  }, [rooms, accessToken]);

  // Reflect hover/selection sync from the list side (§8.6: "Synced list +
  // map split view") by toggling the highlighted marker's active class —
  // Mapbox GL has no built-in bounce animation like the Google Maps
  // `Animation.BOUNCE` this replaces; `.spotva-map-marker--active` (see
  // globals.css) scales the pin and raises its z-index instead.
  useEffect(() => {
    for (const [roomId, marker] of markersRef.current.entries()) {
      marker.getElement().classList.toggle('spotva-map-marker--active', roomId === highlightedRoomId);
    }
  }, [highlightedRoomId]);

  if (!accessToken) {
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
