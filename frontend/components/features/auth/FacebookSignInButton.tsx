'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

  if (!appId) return null;

  async function handleClick() {
    setIsLoading(true);
    try {
      const FB = await loadFacebookSdk(appId!);
      FB.login(
        (loginResponse) => {
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
                router.push(redirectTo ?? '/');
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
    } catch {
      onError(t('errors.generic'));
      setIsLoading(false);
    }
  }

  return (
    <Button type="button" variant="secondary" fullWidth isLoading={isLoading} onClick={handleClick}>
      {t('continueWithFacebook')}
    </Button>
  );
}
