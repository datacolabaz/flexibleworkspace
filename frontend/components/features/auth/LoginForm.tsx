'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { GoogleSignInButton } from './GoogleSignInButton';
import { FacebookSignInButton } from './FacebookSignInButton';

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
 * Google/Facebook are the only sign-in methods — the OTP (email/phone +
 * 6-digit code) flow this replaced is gone from the UI. Two reasons,
 * both from the account owner directly: neither OTP channel actually
 * delivered in this deployment (SMS was never vendor-wired; SMTP was
 * never configured on Railway — see PHASE4_REPORT.md's OAuth section),
 * and once Google/Facebook sign-in covers "is this a real person," a
 * custom code round-trip adds nothing OTP was providing — the identity
 * check happens on Google's/Facebook's own side (their account picker,
 * or their password prompt), not by texting/emailing a code ourselves.
 * The backend's OTP endpoints and BFF routes (app/api/auth/otp/*) are
 * left in place, just unused from here, rather than deleted — reversible
 * with no data-model risk if a non-OAuth path is ever needed again.
 *
 * A page script never sees a token either way: GoogleSignInButton /
 * FacebookSignInButton each POST straight to their own BFF route, which
 * sets this origin's httpOnly session cookies and owns the redirect —
 * this component only renders them and surfaces `onError` as a banner.
 */
export function LoginForm({ redirectTo }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const [banner, setBanner] = useState<string | undefined>();

  function handleOAuthError(message: string) {
    setBanner(message);
  }

  // Both buttons render nothing when their own env var isn't set (see
  // each component) — in an environment with neither configured (e.g.
  // local dev without OAuth credentials), there'd be nothing on the
  // page at all, so that case gets its own message instead of a blank
  // card.
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const hasFacebook = Boolean(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-h3 text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-body text-text-secondary">{t('subtitle')}</p>
      </div>

      {banner && <Alert variant="error">{banner}</Alert>}

      {hasGoogle || hasFacebook ? (
        <div className="flex flex-col gap-3">
          <GoogleSignInButton redirectTo={redirectTo} onError={handleOAuthError} />
          <FacebookSignInButton redirectTo={redirectTo} onError={handleOAuthError} />
        </div>
      ) : (
        <Alert variant="error">{t('noMethodsAvailable')}</Alert>
      )}
    </div>
  );
}
