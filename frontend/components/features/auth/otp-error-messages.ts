/**
 * Maps a BFF/backend error code — the `error.code` field of the
 * `{error:{code,message,details}}` envelope every `/api/auth/*` route
 * returns (lib/auth/route-helpers.ts's `apiErrorResponse`) — to a
 * translation key under the `auth.login.errors` namespace.
 *
 * Kept as a pure function (no i18n import, no React) so the mapping
 * itself is unit-testable without rendering anything, and so it can't
 * silently drift from the real codes: the backend codes are documented
 * inline below, sourced from backend/src/modules/auth/auth.service.ts and
 * this frontend's own Route Handlers (docs/phase4/PHASE4_REPORT.md's BFF
 * section has the full list with response-status mapping).
 */
export type OtpErrorKey =
  | 'validationError'
  | 'invalidCode'
  | 'tooManyAttempts'
  | 'rateLimited'
  | 'userNotFound'
  | 'generic';

export function otpErrorMessageKey(code: string | undefined): OtpErrorKey {
  switch (code) {
    // This BFF route's own body validation (app/api/auth/otp/*/route.ts) —
    // missing/malformed identifier or code, never reaches the backend.
    case 'VALIDATION_ERROR':
    case 'INVALID_JSON':
      return 'validationError';
    // auth.service.ts verifyOtp(): wrong code or the code's TTL passed.
    case 'OTP_INVALID_OR_EXPIRED':
      return 'invalidCode';
    // auth.service.ts verifyOtp(): the per-OTP attempt limit was hit —
    // this code is now dead, a new one must be requested.
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'tooManyAttempts';
    // auth.controller.ts's throttle on POST /auth/otp/request.
    case 'RATE_LIMITED':
      return 'rateLimited';
    // auth.service.ts verifyOtp(): no account for this identifier.
    case 'USER_NOT_FOUND':
      return 'userNotFound';
    // Anything else — BFF_INTERNAL_ERROR (backend unreachable), an
    // unmapped backend code, or no code at all (a network failure never
    // reached a JSON body in the first place).
    default:
      return 'generic';
  }
}

// Codes that describe a systemic/throttling condition rather than
// something wrong with what the person just typed — shown as a page-level
// <Alert>, not as the field-level error under the identifier/code input,
// since retyping the same value won't fix any of these.
const BANNER_CODES = new Set(['RATE_LIMITED', 'OTP_TOO_MANY_ATTEMPTS', 'USER_NOT_FOUND']);

export function isBannerLevelError(code: string | undefined): boolean {
  return code !== undefined && BANNER_CODES.has(code);
}
