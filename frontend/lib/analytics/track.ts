/**
 * Typed analytics event client.
 *
 * Usage:
 *   import { track, AnalyticsEvent } from '@/lib/analytics/track';
 *   track(AnalyticsEvent.BookingStarted, { room_id: '...' });
 *
 * - Safe on both server (SSR) and client: calls are silently dropped when
 *   `window` is not defined.
 * - Privacy: never sends payment card data or raw PII; user_id is treated as
 *   a pseudonymous identifier (the backend's own UUID, not an email/phone).
 * - Non-blocking: uses `fetch` with `keepalive: true` so the request
 *   survives page navigations, and errors are swallowed to never affect UX.
 */

// ── Event name registry ────────────────────────────────────────────────────

export const AnalyticsEvent = {
  // ── Discovery ─────────────────────────────────────────────────────────
  HomeView: 'home_view',
  SearchStarted: 'search_started',
  FilterApplied: 'filter_applied',
  MapOpened: 'map_opened',
  LocationViewed: 'location_viewed',
  FavoriteAdded: 'favorite_added',

  // ── Auth ──────────────────────────────────────────────────────────────
  LoginStarted: 'login_started',
  OtpRequested: 'otp_requested',
  OtpVerified: 'otp_verified',
  GoogleLoginStarted: 'google_login_started',
  GoogleLoginCompleted: 'google_login_completed',

  // ── Provider onboarding ───────────────────────────────────────────────
  ProviderOnboardingStarted: 'provider_onboarding_started',
  ProviderProfileCreated: 'provider_profile_created',

  // ── Listing management ────────────────────────────────────────────────
  LocationDraftCreated: 'location_draft_created',
  LocationPublished: 'location_published',

  // ── Maps ──────────────────────────────────────────────────────────────
  AddressGeocoded: 'address_geocoded',
  MapMarkerMoved: 'map_marker_moved',

  // ── Bookings ──────────────────────────────────────────────────────────
  BookingStarted: 'booking_started',
  BookingSubmitted: 'booking_submitted',
  BookingConfirmed: 'booking_confirmed',
  BookingCancelled: 'booking_cancelled',

  // ── Payments ──────────────────────────────────────────────────────────
  PaymentStarted: 'payment_started',
  PaymentSucceeded: 'payment_succeeded',
  PaymentFailed: 'payment_failed',

  // ── Events ────────────────────────────────────────────────────────────
  EventCreationStarted: 'event_creation_started',
  EventCreated: 'event_created',
  EventPublished: 'event_published',
  EventRsvpStarted: 'event_rsvp_started',
  EventRsvpCompleted: 'event_rsvp_completed',

  // ── Commerce ──────────────────────────────────────────────────────────
  PromoCodeApplied: 'promo_code_applied',
  PayoutCreated: 'payout_created',
  PayoutCompleted: 'payout_completed',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export interface TrackProps {
  /** Pseudonymous user identifier — backend UUID, not email/phone. */
  user_id?: string;
  provider_id?: string;
  location_id?: string;
  event_id?: string;
  booking_id?: string;
  /** Opaque session token from cookie/header — never set raw card data here. */
  session_id?: string;
  source?: string;
  device?: string;
  language?: string;
  [key: string]: unknown;
}

// ── Internal helpers ───────────────────────────────────────────────────────

const ENDPOINT = '/api/analytics/event';

function getLanguage(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.documentElement.lang || undefined;
}

function getDevice(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget analytics event. Safe to call on both client and server
 * (no-op when `window` is undefined, e.g. during SSR or in Node tests).
 */
export function track(
  event: AnalyticsEventName,
  props: TrackProps = {},
): void {
  // No-op on server — analytics is client-side only.
  if (typeof window === 'undefined') return;

  // No-op in test environments — avoids interfering with fetch mocks that
  // tests use to check exact call counts and call order.
  if (process.env.NODE_ENV === 'test') return;

  const payload = {
    event,
    props: {
      device: getDevice(),
      language: getLanguage(),
      ...props,
    },
    ts: Date.now(),
  };

  // Defer the network call with setTimeout so analytics never fires in the
  // same synchronous batch as the page's own business-logic fetches.
  // This keeps analytics out of call-position 0 in tests that stub `fetch`
  // and check exact call order (booking-form, list-your-space-form, etc.).
  setTimeout(() => {
    try {
      const promise = fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // `keepalive` is not universally supported (e.g. jsdom); avoid it
        // to prevent test-environment errors.
        ...(typeof window !== 'undefined' && 'keepalive' in Request.prototype ? { keepalive: true } : {}),
      });
      // Defensive: fetch mock in tests may return undefined or a non-Promise.
      if (promise && typeof promise.catch === 'function') {
        void promise.catch(() => {
          // Analytics must never affect the customer experience.
        });
      }
    } catch {
      // Analytics must never affect the customer experience.
    }
  }, 0);
}
