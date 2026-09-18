/**
 * The BFF's own session cookies — httpOnly, set/read only by Route
 * Handlers and Server Components, never by client-side JS
 * (FRONTEND_IMPLEMENTATION_PLAN.md §4, go-ahead item 10: "never expose
 * backend secrets/OAuth secrets to the browser"). The backend's
 * AuthController itself is untouched; these names/shapes are purely a
 * frontend-domain concern.
 */
export const ACCESS_TOKEN_COOKIE = 'spotva_access_token';
export const REFRESH_TOKEN_COOKIE = 'spotva_refresh_token';

// Mirrors backend/src/config/configuration.ts's JWT_REFRESH_EXPIRES_IN
// default ('30d'). The backend's /auth/refresh and /auth/otp/verify
// responses don't expose the refresh token's own lifetime (only the
// access token's, as `expiresIn`), so this is a BFF-side assumption, not
// a derived value — if that backend default ever changes, update this
// constant to match.
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Deliberately a small local type rather than importing Next's internal
// cookie type (which lives under a `next/dist/...` path not meant for
// external use) — this is exactly the subset `NextResponse.cookies.set()`
// and `NextRequest.cookies.set()` accept.
export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

const baseCookieOptions: Omit<CookieOptions, 'maxAge'> = {
  httpOnly: true,
  // Secure in every real deployment; relaxed only so `npm run dev` works
  // over plain http://localhost without a local TLS cert.
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

export function accessTokenCookieOptions(expiresInSeconds: number): CookieOptions {
  return { ...baseCookieOptions, maxAge: expiresInSeconds };
}

export function refreshTokenCookieOptions(): CookieOptions {
  return { ...baseCookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS };
}

/** Options for overwriting a cookie with an empty value to clear it. */
export function clearedCookieOptions(): CookieOptions {
  return { ...baseCookieOptions, maxAge: 0 };
}
