'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { loadMapboxGl } from '@/lib/maps/loadMapbox';
import type mapboxgl from 'mapbox-gl';

export interface RoomLocationMapProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  roomName: string;
  className?: string;
}

/**
 * `15_MAPS_ARCHITECTURE.md` §15.1: "Room detail page map — single marker —
 * Once per room-detail view." Single, non-interactive-feeling marker (no
 * click sync needed here, unlike the search results map) — this component
 * owns its own map instance rather than sharing `SearchResultsMap`'s,
 * since that one is built around a live-updating multi-room marker set.
 *
 * Lazy-loaded (mounted only when the room detail page renders it, same
 * discipline as the search map — §7.8/§15.1: never load Mapbox GL on a
 * page that doesn't need it) and degrades to a placeholder without a
 * browser Mapbox token, same as `SearchResultsMap`.
 */
export function RoomLocationMap({ lat, lng, roomName, className }: RoomLocationMapProps) {
  const t = useTranslations('room');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasCoordinates = lat !== null && lat !== undefined && lng !== null && lng !== undefined;

  useEffect(() => {
    if (!accessToken || !hasCoordinates || !containerRef.current) return undefined;
    let cancelled = false;
    // Mapbox takes [lng, lat] — the reverse of the {lat, lng} shape the
    // rest of this app (and Google Maps) uses.
    const position: [number, number] = [lng as number, lat as number];

    loadMapboxGl(accessToken)
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: position,
          zoom: 15,
          cooperativeGestures: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        new mapboxgl.Marker({ color: '#E7A550' })
          .setLngLat(position)
          .setPopup(new mapboxgl.Popup({ closeButton: false, offset: 24 }).setText(roomName))
          .addTo(map);
        mapRef.current = map;
      })
      .catch((err) => {
        console.error('Failed to load Mapbox GL:', err);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [accessToken, hasCoordinates, lat, lng, roomName]);

  if (!hasCoordinates) return null;

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  if (!accessToken) {
    return (
      <div className={['flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-elevated p-6 text-center', className ?? ''].join(' ')}>
        <p className="text-small text-text-muted">{t('mapUnavailable')}</p>
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="text-small font-semibold text-primary underline">
          {t('getDirections')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} role="application" aria-label={t('mapLabel', { room: roomName })} className={['rounded-lg', className ?? ''].join(' ')} />
      {/* Plain deep-link, not a billed API call — 15_MAPS_ARCHITECTURE.md §15.1. Kept as a Google Maps directions link regardless of render provider — it's a universal deep link any device/app resolves, not tied to which library draws the embedded map. */}
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="self-start text-small font-semibold text-primary underline">
        {t('getDirections')}
      </a>
    </div>
  );
}
