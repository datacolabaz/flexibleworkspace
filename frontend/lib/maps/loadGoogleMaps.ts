/**
 * Minimal Google Maps JS API loader — a single `<script>` injection with a
 * global callback, memoized so multiple mounts of the map (e.g. filter
 * changes re-rendering `SearchResultsMap`) never load the script twice.
 * `15_MAPS_ARCHITECTURE.md` §15.1: lazy-load, never on the homepage, and
 * only the browser-restricted key (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`,
 * safe to expose — referrer-restricted in Google Cloud Console, not
 * secret) ever reaches the client. No `@googlemaps/js-api-loader`
 * dependency — the script-tag + callback approach is ~20 lines and this
 * is the only place in the app that needs it.
 */

declare global {
  interface Window {
    google?: typeof google;
    __spotvaGoogleMapsCallback__?: () => void;
  }
}

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadGoogleMaps() can only run in the browser.'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__spotvaGoogleMapsCallback__ = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error('Google Maps script loaded but window.google.maps is missing.'));
      }
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__spotvaGoogleMapsCallback__&loading=async`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the Google Maps script.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
