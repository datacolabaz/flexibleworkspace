/**
 * Loads the Facebook JS SDK as a plain script tag — same memoized-promise
 * shape as loadGoogleIdentity.ts. Facebook's own init contract requires a
 * global `window.fbAsyncInit` callback (its script calls this itself once
 * loaded, rather than a script.onload we control), so this waits on that
 * instead.
 */
let loadPromise: Promise<NonNullable<Window['FB']>> | null = null;

export function loadFacebookSdk(appId: string): Promise<NonNullable<Window['FB']>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadFacebookSdk() can only run in the browser.'));
  }
  if (window.FB) {
    return Promise.resolve(window.FB);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: 'v21.0', xfbml: false, cookie: false });
      resolve(window.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load the Facebook SDK script.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
