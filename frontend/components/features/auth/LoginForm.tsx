'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface LoginFormProps {
  /**
   * Where to send the visitor after a successful sign-in, e.g.
   * `/account/bookings` when they were redirected here from the
   * `/account` area, or a room page when `BookmarkButton`'s "sign in to
   * save" link sent them here. Already validated server-side by the page
   * (`safeRedirectTarget`) — this component trusts it as-is rather than
   * re-validating, since a Client Component has no safe way to tell a
   * legitimate same-origin path from something injected into the URL by
   * hand. Falls back to `/` when absent (see GoogleSignInButton /
   * FacebookSignInButton, which own the actual redirect).
   */
  redirectTo?: string;
}

/**
 * Google is the only sign-in method rendered here. Two things were
 * removed from the UI before this, both from the account owner directly:
 *
 * - The OTP (email/phone + 6-digit code) flow: neither OTP channel
 *   actually delivered in this deployment (SMS was never vendor-wired;
 *   SMTP was never configured on Railway — see PHASE4_REPORT.md's OAuth
 *   section), and once OAuth sign-in covers "is this a real person," a
 *   custom code round-trip adds nothing OTP was providing.
 * - Facebook Login: kept failing in production even after the real bugs
 *   in it were fixed one by one (popup-blocking, router-cache staleness,
 *   a missing Cross-Origin-Opener-Policy header) — the account owner hit
 *   Facebook's own login service erroring on their end (unrelated to
 *   this app) and decided Google alone is enough for this deployment.
 *
 * Both the OTP endpoints/BFF routes (app/api/auth/otp/*) and
 * FacebookSignInButton + its BFF route (app/api/auth/facebook/route.ts)
 * are left in place, just unused from here, rather than deleted —
 * reversible with no data-model risk if either is ever wanted again.
 *
 * A page script never sees a token: GoogleSignInButton POSTs straight to
 * its own BFF route, which sets this origin's httpOnly session cookies
 * and owns the redirect — this component only renders it and surfaces
 * `onError` as a banner.
 */
export function LoginForm({ redirectTo }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const [banner, setBanner] = useState<string | undefined>();

  function handleOAuthError(message: string) {
    setBanner(message);
  }

  // GoogleSignInButton renders nothing when its own env var isn't set
  // (see that component) — in an environment without OAuth credentials
  // (e.g. local dev), there'd be nothing on the page at all, so that
  // case gets its own message instead of a blank card.
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-h3 text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-body text-text-secondary">{t('subtitle')}</p>
      </div>

      {banner && <Alert variant="error">{banner}</Alert>}

      {hasGoogle ? (
        <div className="flex flex-col gap-3">
          <GoogleSignInButton redirectTo={redirectTo} onError={handleOAuthError} />
        </div>
      ) : (
        <Alert variant="error">{t('noMethodsAvailable')}</Alert>
      )}
    </div>
  );
}
