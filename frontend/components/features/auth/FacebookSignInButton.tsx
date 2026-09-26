'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { loadFacebookSdk } from '@/lib/auth/loadFacebookSdk';
import { oauthErrorMessageKey } from './oauth-error-messages';
import type { OAuthSignInButtonProps } from './GoogleSignInButton';

/**
 * Facebook's JS SDK doesn't offer a styled "render this button for me"
 * call the way Google's does (XFBML markup is the closest thing, and it
 * needs the SDK parsing the DOM at load time rather than a controlled
 * React tree) — so this is our own Button (`secondary` variant, matching
 * every other non-primary action on this page) that drives `FB.login()`
 * imperatively on click. Same BFF hand-off as GoogleSignInButton: the
 * access token goes straight to app/api/auth/facebook/route.ts and is
 * never stored or reused client-side.
 */
export function FacebookSignInButton({ redirectTo, onError }: OAuthSignInButtonProps) {
  const t = useTranslations('auth.login');
  // Plain next/navigation router, not the locale-aware one from
  // lib/i18n/navigation — redirectTo can point at /provider or /admin,
  // which deliberately live outside app/[locale]/** (see
  // frontend/middleware.ts's matcher). The locale-aware router prepends
  // the current locale to every push(), turning '/provider' into
  // '/az/provider', a 404 (matches AdminPasswordForm.tsx's own router
  // choice for the same reason). A customer route like '/account/bookings'
  // still resolves correctly without a client-side prefix: middleware
  // redirects the unprefixed request to its localized URL itself.
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

  // Start fetching the Facebook SDK as soon as this button mounts, rather
  // than waiting for the click. FB.login() opens its sign-in window with
  // window.open(), and browsers only allow that when it's called
  // synchronously inside a genuine click handler — any await in between
  // (the SDK's own script tag doing a real network fetch, which is what
  // used to happen here on every visitor's very first click, since the
  // SDK is never cached yet) breaks that chain, so the browser silently
  // blocks the popup: FB.login()'s callback never fires, no error
  // surfaces, and the click looks like it did nothing at all. Preloading
  // here means window.FB already exists by the time someone clicks, so
  // handleClick can call FB.login() synchronously.
  useEffect(() => {
    if (!appId) return;
    loadFacebookSdk(appId).catch(() => {
      // Network hiccup / blocked request — handleClick's own fallback
      // path below covers this on click.
    });
  }, [appId]);

  if (!appId) return null;

  function runLogin(FB: NonNullable<Window['FB']>) {
    setIsLoading(true);

    // Detect a blocked popup instead of leaving the button spinning
    // forever with no feedback: FB.login() calls window.open()
    // synchronously below, so a temporary patch around just this call
    // catches a blocked window (window.open returning null/undefined)
    // without touching window.open for anything else on the page.
    const originalOpen = window.open;
    let popupBlocked = false;
    window.open = ((...args: Parameters<typeof window.open>) => {
      const win = originalOpen.apply(window, args);
      if (!win) popupBlocked = true;
      return win;
    }) as typeof window.open;

    // Facebook's SDK normally calls back once the popup either
    // authorizes or is closed — but if the visitor navigates *inside*
    // that popup (to their own Facebook feed, say) instead of closing
    // it, the popup is never "closed" and never redirects back either,
    // so FB.login()'s callback can simply never fire. Without this
    // timeout, the button spins forever with no way out except
    // reloading the page. 90s is generous for someone actually working
    // through the permission dialog, but still gives up eventually.
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      onError(t('errors.loginTimedOut'));
      setIsLoading(false);
    }, 90_000);

    try {
      FB.login(
        (loginResponse) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          const accessToken = loginResponse.authResponse?.accessToken;
          if (!accessToken) {
            // Person closed the dialog or declined the permission —
            // not an error worth a banner, just stop the spinner.
            setIsLoading(false);
            return;
          }
          void (async () => {
            try {
              const res = await fetch('/api/auth/facebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken }),
              });
              if (res.ok) {
                // See the matching comment in GoogleSignInButton — push()
                // alone can render a page Next.js had already cached
                // from before this sign-in.
                router.push(redirectTo ?? '/account/bookings');
                router.refresh();
                return;
              }
              const body = (await res.json().catch(() => undefined)) as
                | { error?: { code?: string } }
                | undefined;
              onError(t(`errors.${oauthErrorMessageKey(body?.error?.code)}`));
            } catch {
              onError(t('errors.generic'));
            } finally {
              setIsLoading(false);
            }
          })();
        },
        { scope: 'email', return_scopes: true },
      );
    } finally {
      window.open = originalOpen;
    }

    if (popupBlocked) {
      settled = true;
      window.clearTimeout(timeoutId);
      onError(t('errors.popupBlocked'));
      setIsLoading(false);
    }
  }

  function handleClick() {
    if (!appId) return;
    if (window.FB) {
      runLogin(window.FB);
      return;
    }
    // Preload above hasn't resolved yet (slow network, or the script was
    // blocked) — fall back to loading on click. This can still lose the
    // popup permission the same way the old code always did, but it's
    // now the rare case rather than the default, and a blocked popup at
    // least surfaces the message above instead of silence.
    setIsLoading(true);
    loadFacebookSdk(appId)
      .then((FB) => runLogin(FB))
      .catch(() => {
        onError(t('errors.generic'));
        setIsLoading(false);
      });
  }

  return (
    <Button type="button" variant="secondary" fullWidth isLoading={isLoading} onClick={handleClick}>
      {t('continueWithFacebook')}
    </Button>
  );
}
