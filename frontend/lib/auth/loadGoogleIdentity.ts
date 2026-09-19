/**
 * Loads Google Identity Services (the "Sign in with Google" button/ID-token
 * flow) as a plain script tag — mirrors lib/maps/loadMapbox.ts's memoized-
 * promise pattern, since GIS has no npm package to dynamic-import.
 */
let loadPromise: Promise<NonNullable<Window['google']>> | null = null;

export function loadGoogleIdentityServices(): Promise<NonNullable<Window['google']>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadGoogleIdentityServices() can only run in the browser.'));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services script loaded but window.google is missing.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
