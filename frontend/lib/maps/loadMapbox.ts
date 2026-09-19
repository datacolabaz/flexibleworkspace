/**
 * Lazy-loads the Mapbox GL JS module (only when a map component actually
 * mounts, via a dynamic `import()`) and sets the public access token once,
 * memoized so repeated mounts (e.g. `SearchResultsMap` remounting on
 * filter changes) never re-import the module or re-set the token.
 * `15_MAPS_ARCHITECTURE.md` §15.1: lazy-load, never on the homepage, and
 * only the browser-scoped public token (`NEXT_PUBLIC_MAPBOX_TOKEN` — a
 * `pk.` token, meant to be restricted by URL in the Mapbox account's
 * token settings, not secret) ever reaches the client.
 *
 * Replaces the earlier `loadGoogleMaps.ts` script-tag loader — this app
 * switched map providers from Google Maps to Mapbox (real Mapbox
 * credentials were available; no Google Maps key was). See
 * `PHASE4_REPORT.md`'s "Maps provider switched to Mapbox" addendum.
 */

let loadPromise: Promise<typeof import('mapbox-gl').default> | null = null;

export function loadMapboxGl(accessToken: string): Promise<typeof import('mapbox-gl').default> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadMapboxGl() can only run in the browser.'));
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = import('mapbox-gl').then((mod) => {
    const mapboxgl = mod.default;
    mapboxgl.accessToken = accessToken;
    return mapboxgl;
  });

  return loadPromise;
}
