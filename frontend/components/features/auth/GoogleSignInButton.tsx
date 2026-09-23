'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { loadGoogleIdentityServices } from '@/lib/auth/loadGoogleIdentity';
import { oauthErrorMessageKey } from './oauth-error-messages';

export interface OAuthSignInButtonProps {
  /** Same meaning as LoginForm's redirectTo — where to send the visitor
   * after a successful sign-in. */
  redirectTo?: string;
  onError: (message: string) => void;
}

/**
 * Renders Google's own "Sign in with Google" button (via Identity Services'
 * `renderButton`, not a hand-built lookalike — using their real widget is
 * what keeps this eligible for their branding guidelines and gets their
 * account-chooser UX for free). On success, POSTs the ID token to the BFF
 * (app/api/auth/google/route.ts), which sets the same httpOnly session
 * cookies OTP login does — this component never sees a token beyond the
 * one instant it forwards to fetch().
 *
 * Degrades to rendering nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't
 * set, same posture as RoomLocationMap without a Mapbox token — OTP login
 * stays fully usable either way, this is purely additive.
 */
export function GoogleSignInButton({ redirectTo, onError }: OAuthSignInButtonProps) {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined;
    let cancelled = false;
    const container = containerRef.current;

    // Google's own button (rendered inside its iframe) opens its sign-in
    // window itself — we never call window.open ourselves, so we can't
    // wrap it the way FacebookSignInButton wraps FB.login(). When that
    // window is blocked (an aggressive popup blocker, or the site being
    // opened inside an embedded browser such as the Instagram/Facebook
    // in-app browser, which disallow popups outright), the click just
    // does nothing — Google's SDK logs it to the console as a
    // "[GSI_LOGGER] Failed to open popup window" error but never calls
    // back into our code, so nothing else tells the visitor what
    // happened. Watching for that specific, stable log line is the only
    // hook available here, and turns that silence into a real message.
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      if (text.includes('[GSI_LOGGER]') && /popup/i.test(text)) {
        onError(t('errors.popupBlocked'));
      }
      originalConsoleError(...args);
    };

    loadGoogleIdentityServices()
      .then((google) => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: clientId,
          // Chrome's newer FedCM-based rendering shows a personalized
          // "Continue as <name> / <email>" card whenever the browser
          // already has a signed-in Google session — that's Chrome's own
          // account-chooser UI, not our button, so none of renderButton's
          // own options (theme/text/shape/…) can change it. Opting out of
          // FedCM here keeps the classic button: a plain "Continue with
          // Google" that matches the Facebook button beside it, with the
          // account only chosen after a click, inside Google's own popup —
          // rather than showing the visitor's email on the page itself.
          use_fedcm_for_button: false,
          callback: (response) => {
            void (async () => {
              try {
                const res = await fetch('/api/auth/google', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ idToken: response.credential }),
                });
                if (res.ok) {
                  // push() alone lands on whatever Next.js had already
                  // cached for that route from before sign-in (same
                  // reason AccountTabs' logout pairs push with refresh)
                  // — without this, the header/account pages can render
                  // stale pre-login (or even a previous visitor's
                  // cached) data instead of this session's own profile.
                  router.push(redirectTo ?? '/');
                  router.refresh();
                  return;
                }
                const body = (await res.json().catch(() => undefined)) as
                  | { error?: { code?: string } }
                  | undefined;
                onError(t(`errors.${oauthErrorMessageKey(body?.error?.code)}`));
              } catch {
                onError(t('errors.generic'));
              }
            })();
          },
        });
        // Google's button has no CSS "100%" width — measuring the
        // container it's given (a full-width flex child) reproduces that
        // full-width look without hardcoding a guess.
        const width = Math.min(Math.max(container.offsetWidth, 240), 400);
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width,
        });
      })
      .catch(() => {
        // Script failed to load (network hiccup, ad/tracker blocker) — the
        // button area just stays empty; OTP login is unaffected.
      });

    return () => {
      cancelled = true;
      console.error = originalConsoleError;
    };
  }, [clientId, redirectTo, router, t, onError]);

  if (!clientId) return null;

  return (
    <div className="rounded-full border border-border bg-surface p-1 shadow-sm">
      <div ref={containerRef} className="flex min-h-11 w-full items-center justify-center overflow-hidden rounded-full" />
    </div>
  );
}
