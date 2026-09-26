'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { loadMapboxGl } from '@/lib/maps/loadMapbox';
import type mapboxgl from 'mapbox-gl';

export interface LocationPickerMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

/** Imperative handle for moving the pin from OUTSIDE user interaction — see `recenter` below. */
export interface LocationPickerMapHandle {
  /**
   * Moves the map + marker to a new point without going through the
   * `lat`/`lng` props (see the component doc comment for why prop changes
   * are ignored after mount). Used by `LocationForm` to jump the pin to a
   * geocoded address; a no-op before the map has finished loading.
   */
  recenter: (lat: number, lng: number) => void;
}

/**
 * Draggable-pin map for a provider to set their business location's
 * actual point — click anywhere on the map to move the pin, or drag it
 * directly. `LocationForm` forward-geocodes typed addresses and reverse-
 * geocodes manual marker moves; this component keeps the visible marker and
 * viewport synchronized with the resulting coordinates.
 *
 * Same Mapbox GL loading/degradation pattern as `RoomLocationMap` (lazy
 * `loadMapboxGl`, plain "unavailable" message without a browser token).
 *
 * The map instance is created once, while later `lat`/`lng` changes move
 * both the marker and viewport. This is required for an address geocode that
 * resolves before or after Mapbox finishes loading. User clicks and drags
 * still flow back through `onChange` and become the next prop position.
 */
export const LocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(function LocationPickerMap(
  { lat, lng, onChange, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const latestPositionRef = useRef<[number, number]>([lng, lat]);
  latestPositionRef.current = [lng, lat];
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useImperativeHandle(
    ref,
    () => ({
      recenter: (nextLat: number, nextLng: number) => {
        latestPositionRef.current = [nextLng, nextLat];
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) return;
        marker.setLngLat([nextLng, nextLat]);
        map.flyTo({ center: [nextLng, nextLat], zoom: Math.max(map.getZoom(), 14), essential: true });
      },
    }),
    [],
  );

  useEffect(() => {
    if (!accessToken || !containerRef.current) return undefined;
    let cancelled = false;

    loadMapboxGl(accessToken)
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: latestPositionRef.current,
          zoom: 14,
          cooperativeGestures: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        const marker = new mapboxgl.Marker({ color: '#E7A550', draggable: true })
          .setLngLat(latestPositionRef.current)
          .addTo(map);

        marker.on('dragend', () => {
          const position = marker.getLngLat();
          onChangeRef.current(position.lat, position.lng);
        });
        map.on('click', (event) => {
          marker.setLngLat(event.lngLat);
          onChangeRef.current(event.lngLat.lat, event.lngLat.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch((err) => {
        console.error('Failed to load Mapbox GL:', err);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([lng, lat]);
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), essential: true });
  }, [lat, lng]);

  if (!accessToken) {
    return (
      <div
        className={[
          'flex items-center justify-center rounded-lg border border-dashed border-border bg-surface-elevated p-6 text-center text-small text-text-muted',
          className ?? '',
        ].join(' ')}
      >
        Xəritə hazırda mövcud deyil — bu bölmə sonradan mövqeyi dəqiqləşdirmək üçün açılacaq.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Məkanı xəritədə seçin — nişanı sürükləyin və ya xəritəyə klikləyin"
      className={['rounded-lg', className ?? ''].join(' ')}
    />
  );
});
