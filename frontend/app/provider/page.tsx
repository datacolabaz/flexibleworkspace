import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { readSession } from '@/lib/auth/session';
import { getMyProvider, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { listMyLeads } from '@/lib/api-client/leads';
import {
  listMyLocations,
  listMyRooms,
  listRoomTypes,
  getMediaCapabilities,
  type MediaCapabilities,
} from '@/lib/api-client/provider-rooms';
import { getMyProviderAnalytics, type ProviderAnalytics } from '@/lib/api-client/provider-analytics';
import { ProviderVerificationPanel } from '@/components/features/provider/ProviderVerificationPanel';
import { ProviderLeadsPanel } from '@/components/features/provider/ProviderLeadsPanel';
import { ProviderRoomsPanel } from '@/components/features/provider/ProviderRoomsPanel';
import { ProviderAnalyticsPanel } from '@/components/features/provider/ProviderAnalyticsPanel';

export const metadata: Metadata = {
  title: 'Provider paneli — Spotva',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href="/az" aria-label="Spotva ana səhifə" title="Spotva ana səhifə" className="self-start">
        <Logo variant="auto" height={32} />
      </Link>
      {children}
    </main>
  );
}

/**
 * Minimal provider-side verification dashboard (Sprint 1,
 * 25_PROVIDER_ARCHITECTURE.md) — deliberately narrow: verification status,
 * a way to set the tax ID (`UpdateProviderDto`), and document upload
 * (`POST providers/me/verification-documents`). Room management and the
 * rest of a full provider dashboard are out of this pass's scope; `/provider`
 * stays deliberately NOT locale-prefixed per the route's original comment
 * (06_INFORMATION_ARCHITECTURE.md §6.2).
 *
 * Auth reuses the SAME session cookie as the regular customer site
 * (`readSession`/`ACCESS_TOKEN_COOKIE`) — provider accounts are regular
 * user accounts that self-registered via `POST /providers` and hold a
 * PROVIDER_OWNER/PROVIDER_STAFF role, not a separate login system.
 *
 * Sprint 3 (Lead Tracking) adds `ProviderLeadsPanel` alongside the
 * verification panel — a provider-only leads inbox (customers who
 * expressed interest via the room detail page's `LeadCaptureForm`,
 * without booking/paying). Scope confirmed with the user: leads are
 * visible to the provider here only, not surfaced in the admin panel.
 *
 * Sprint 5 adds `ProviderRoomsPanel` — until this, there was NO way for
 * a provider to actually create a room/listing from the frontend at all
 * (only the backend API existed); this closes that gap. A room needs a
 * `locationId`, and self-registration never creates one, so the panel
 * handles that one-time "business address" step itself when needed.
 *
 * Sprint 6 adds `ProviderAnalyticsPanel` — room views, booking requests,
 * and confirmation rate for the last 30 days, all scoped to this
 * provider's own rooms (`GET provider/analytics`).
 */
export default async function ProviderHome() {
  const { accessToken } = readSession(await cookies());

  if (!accessToken) {
    return (
      <Shell>
        <h1 className="font-display text-h2 text-text-primary">Provider paneli</h1>
        <p className="text-body text-text-secondary">
          Bu səhifəyə baxmaq üçün hesabınıza daxil olun.
        </p>
        <Link
          href={`/az/login?redirect=${encodeURIComponent('/provider')}`}
          className="self-start rounded-md bg-accent px-5 py-3 text-label text-accent-on transition-colors hover:bg-accent-hover"
        >
          Daxil ol
        </Link>
      </Shell>
    );
  }

  try {
    const provider = await getMyProvider(accessToken);
    const [leads, locations, rooms, roomTypes] = await Promise.all([
      listMyLeads(accessToken),
      listMyLocations(accessToken),
      listMyRooms(accessToken),
      listRoomTypes(accessToken),
    ]);

    // Best-effort — analytics is a secondary panel, not a core part of the
    // dashboard, so a hiccup here (same soft-fail convention as
    // `getFeaturedRooms`/the room detail page's initial favorite check)
    // must never break verification/rooms/leads for the whole page.
    let analytics: ProviderAnalytics | null = null;
    try {
      analytics = await getMyProviderAnalytics(accessToken);
    } catch (err) {
      console.error('Best-effort provider analytics fetch failed (rest of the dashboard still works):', err);
    }

    // Same best-effort convention — a hiccup fetching plan limits must not
    // block the whole rooms panel; conservative FREE-tier-shaped defaults
    // (no direct upload, no video) still let the panel render safely, and
    // `ProviderRoomsPanel` falls back to the legacy multipart upload path
    // when `directUploadSupported` is false.
    let mediaCapabilities: MediaCapabilities = {
      directUploadSupported: false,
      maxImageCount: 5,
      videoAllowed: false,
      maxVideoCount: 0,
      maxVideoDurationSeconds: 0,
      maxVideoSizeBytes: 0,
    };
    try {
      mediaCapabilities = await getMediaCapabilities(accessToken);
    } catch (err) {
      console.error('Best-effort media capabilities fetch failed (falling back to conservative defaults):', err);
    }

    return (
      <Shell>
        <ProviderVerificationPanel initialProvider={provider} />
        {analytics && <ProviderAnalyticsPanel analytics={analytics} />}
        <ProviderRoomsPanel
          initialLocations={locations}
          initialRooms={rooms}
          roomTypes={roomTypes}
          mediaCapabilities={mediaCapabilities}
        />
        <ProviderLeadsPanel initialLeads={leads} />
      </Shell>
    );
  } catch (error) {
    if (error instanceof ProviderApiError && error.code === 'NOT_A_PROVIDER') {
      return (
        <Shell>
          <h1 className="font-display text-h2 text-text-primary">Provider paneli</h1>
          <p className="text-body text-text-secondary">
            Hesabınızda hələ provider qeydiyyatı yoxdur. Otağınızı əlavə etmək üçün əvvəlcə provider kimi
            qeydiyyatdan keçin.
          </p>
          <Link
            href="/az/list-your-space"
            className="self-start rounded-md bg-accent px-5 py-3 text-label text-accent-on transition-colors hover:bg-accent-hover"
          >
            Provider kimi qeydiyyatdan keç
          </Link>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="font-display text-h2 text-text-primary">Provider paneli</h1>
        <p className="text-body text-error">Məlumatlar yüklənmədi. Zəhmət olmasa səhifəni yeniləyin.</p>
      </Shell>
    );
  }
}
