'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { loadGoogleMaps } from '@/lib/maps/loadGoogleMaps';

export interface RoomLocationMapProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  roomName: string;
  className?: string;
}

/**
 * 15_MAPS_ARCHITECTURE.md §15.1: "Room detail page map — Maps JavaScript
 * API (static-feeling single marker) — Once per room-detail view."
 * Single, non-interactive-feeling marker (no click sync needed here,
 * unlike the search results map) — this component owns its own map
 * instance rather than sharing `SearchResultsMap`'s, since that one is
 * built around a live-updating multi-room marker set.
 *
 * Lazy-loaded (mounted only when the room detail page renders it, same
 * discipline as the search map — §7.8/§15.1: never load Maps JS on a page
 * that doesn't need it) and degrades to a placeholder without a browser
 * Maps key, same as `SearchResultsMap`.
 */
export function RoomLocationMap({ lat, lng, roomName, className }: RoomLocationMapProps) {
  const t = useTranslations('room');
  const containerRef = useRef<HTMLDivElement>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const hasCoordinates = lat !== null && lat !== undefined && lng !== null && lng !== undefined;

  useEffect(() => {
    if (!apiKey || !hasCoordinates || !containerRef.current) return undefined;
    let cancelled = false;
    const position = { lat: lat as number, lng: lng as number };

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          zoom: 15,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        });
        new google.maps.Marker({ map, position, title: roomName });
      })
      .catch((err) => {
        console.error('Failed to load Google Maps:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, hasCoordinates, lat, lng, roomName]);

  if (!hasCoordinates) return null;

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  if (!apiKey) {
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
      {/* Plain deep-link, not a billed Maps API call — 15_MAPS_ARCHITECTURE.md §15.1. */}
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="self-start text-small font-semibold text-primary underline">
        {t('getDirections')}
      </a>
    </div>
  );
}
