/**
 * Same purpose as otp-error-messages.ts, for the Google/Facebook sign-in
 * buttons: maps a backend error code (auth.service.ts's loginWithGoogle /
 * loginWithFacebook) to a translation key under auth.login.errors.
 */
export type OAuthErrorKey =
  | 'oauthNotConfigured'
  | 'oauthEmailNotVerified'
  | 'oauthEmailRequired'
  | 'oauthFailed'
  | 'generic';

export function oauthErrorMessageKey(code: string | undefined): OAuthErrorKey {
  switch (code) {
    // auth/config.ts: GOOGLE_CLIENT_ID / FACEBOOK_APP_ID not set on this
    // environment — the buttons shouldn't even render in that case
    // (NEXT_PUBLIC_* env check), but the backend refuses defensively too.
    case 'OAUTH_NOT_CONFIGURED':
      return 'oauthNotConfigured';
    case 'OAUTH_EMAIL_NOT_VERIFIED':
      return 'oauthEmailNotVerified';
    case 'OAUTH_EMAIL_REQUIRED':
      return 'oauthEmailRequired';
    case 'OAUTH_TOKEN_INVALID':
      return 'oauthFailed';
    case 'VALIDATION_ERROR':
    case 'INVALID_JSON':
      return 'oauthFailed';
    default:
      return 'generic';
  }
}
