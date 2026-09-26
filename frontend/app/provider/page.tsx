import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { readSession } from '@/lib/auth/session';
import { getMyProvider, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { ListYourSpaceForm } from '@/components/features/business/ListYourSpaceForm';
import azMessages from '@/messages/az.json';
import { listMyLeads } from '@/lib/api-client/leads';
import {
  listMyLocations,
  listMyRooms,
  listRoomTypes,
  listAmenities,
  getMediaCapabilities,
  type MediaCapabilities,
} from '@/lib/api-client/provider-rooms';
import { getMyProviderAnalytics, type ProviderAnalytics } from '@/lib/api-client/provider-analytics';
import { getMyPlanUpgradeRequest, type PlanUpgradeRequest } from '@/lib/api-client/plan-upgrade-requests';
import {
  listProviderBookings,
  getProviderPayoutBalance,
  listProviderPayouts,
  type ProviderBooking,
  type ProviderPayoutBalance,
  type ProviderPayout,
} from '@/lib/api-client/provider-bookings';
import { ProviderLeadsPanel } from '@/components/features/provider/ProviderLeadsPanel';
import { ProviderRoomsPanel } from '@/components/features/provider/ProviderRoomsPanel';
import { ProviderAnalyticsPanel } from '@/components/features/provider/ProviderAnalyticsPanel';
import { ProviderPlanPanel } from '@/components/features/provider/ProviderPlanPanel';
import { ProviderBookingsPanel } from '@/components/features/provider/ProviderBookingsPanel';
import { ProviderPayoutsPanel } from '@/components/features/provider/ProviderPayoutsPanel';

export const metadata: Metadata = {
  title: 'Provider paneli — Spotva',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/az" aria-label="Spotva ana səhifə" title="Spotva ana səhifə" className="self-start">
          <Logo variant="auto" height={32} />
        </Link>
        {/*
          Provider feedback: after saving something in this dashboard
          (e.g. working hours) it was unclear whether finishing a step
          would jump back to the customer homepage on its own, or
          whether there should be an explicit way back up here instead.
          It's the latter - nothing in this dashboard auto-redirects,
          the provider stays exactly where they are after a save - so
          make the always-available way back explicit rather than
          relying on the logo alone being read as a home link.
        */}
        <Link href="/az" className="text-label font-semibold text-primary hover:text-text-primary">
          ← Ana səhifəyə qayıt
        </Link>
      </div>
      {children}
    </main>
  );
}

/**
 * Provider self-service dashboard. `/provider` stays deliberately NOT
 * locale-prefixed per the route's original comment
 * (06_INFORMATION_ARCHITECTURE.md §6.2).
 *
 * Auth reuses the SAME session cookie as the regular customer site
 * (`readSession`/`ACCESS_TOKEN_COOKIE`) — provider accounts are regular
 * user accounts that self-registered via `POST /providers` and hold a
 * PROVIDER_OWNER/PROVIDER_STAFF role, not a separate login system.
 *
 * Sprint 3 (Lead Tracking) adds `ProviderLeadsPanel` — a provider-only leads inbox (customers who
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
 *
 * Adds `ProviderPlanPanel` — FREE vs PRO comparison and a way to ask for
 * an upgrade. No live payment gateway yet (user's explicit choice): the
 * button opens an in-app request instead of a checkout, and an admin
 * grants PRO by hand from the admin panel.
 */
export default async function ProviderHome({
  searchParams,
}: {
  searchParams?: Promise<{ session?: string }>;
}) {
  const sessionState = (await searchParams)?.session;
  const { accessToken } = readSession(await cookies());

  if (!accessToken) {
    return (
      <Shell>
        <h1 className="font-display text-h2 text-text-primary">{azMessages.provider.title}</h1>
        <p className="text-body text-text-secondary">
          {sessionState === 'expired' ? azMessages.provider.sessionExpired : azMessages.provider.signInRequired}
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
    const [leadsResult, locationsResult, roomsResult, roomTypesResult, amenitiesResult] = await Promise.allSettled([
      listMyLeads(accessToken),
      listMyLocations(accessToken),
      listMyRooms(accessToken),
      listRoomTypes(accessToken),
      listAmenities(accessToken),
    ]);

    // Best-effort: booking list and payout data — failures must not block the
    // core dashboard panels (same convention as analytics/mediaCapabilities).
    let providerBookings: ProviderBooking[] | null = null;
    let payoutBalance: ProviderPayoutBalance | null = null;
    let providerPayouts: ProviderPayout[] | null = null;
    try {
      [providerBookings, payoutBalance, providerPayouts] = await Promise.all([
        listProviderBookings(accessToken),
        getProviderPayoutBalance(accessToken),
        listProviderPayouts(accessToken),
      ]);
    } catch (err) {
      console.error('Best-effort provider bookings/payouts fetch failed:', err);
    }
    if (
      locationsResult.status === 'rejected' ||
      roomsResult.status === 'rejected' ||
      roomTypesResult.status === 'rejected' ||
      amenitiesResult.status === 'rejected'
    ) {
      throw new Error('PROVIDER_DATA_LOAD_FAILED');
    }
    const leads = leadsResult.status === 'fulfilled' ? leadsResult.value : [];
    const locations = locationsResult.value;
    const rooms = roomsResult.value;
    const roomTypes = roomTypesResult.value;
    const amenityOptions = amenitiesResult.value;

    // Best-effort — analytics is a secondary panel, not a core part of the
    // dashboard, so a hiccup here (same soft-fail convention as
    // `getFeaturedRooms`/the room detail page's initial favorite check)
    // must never break rooms/leads for the whole page.
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

    // Same best-effort convention — a hiccup here must not block the rest
    // of the dashboard; `null` just means `ProviderPlanPanel` shows the
    // upgrade form instead of the "request sent" state.
    let planUpgradeRequest: PlanUpgradeRequest | null = null;
    try {
      planUpgradeRequest = await getMyPlanUpgradeRequest(accessToken);
    } catch (err) {
      console.error('Best-effort plan-upgrade-request fetch failed:', err);
    }

    return (
      <Shell>
        {locations.length === 0 && (
          <div className="rounded-md border border-border bg-surface p-4">
            <h1 className="font-display text-h2 text-text-primary">{azMessages.provider.emptyLocationsTitle}</h1>
            <p className="mt-2 text-body text-text-secondary">{azMessages.provider.emptyLocationsMessage}</p>
          </div>
        )}
        <Card className="flex flex-col gap-1 p-5">
          <p className="text-label text-text-secondary">{provider.legalName}</p>
          <h1 className="font-display text-h3 text-text-primary">{provider.displayName}</h1>
          <p className="text-small text-text-secondary">Məkanlarınızı, rezervasiyalarınızı və planınızı buradan idarə edin.</p>
        </Card>
        {analytics && <ProviderAnalyticsPanel analytics={analytics} />}
        <div id="provider-rooms">
          <ProviderRoomsPanel
            initialLocations={locations}
            initialRooms={rooms}
            roomTypes={roomTypes}
            amenityOptions={amenityOptions}
            mediaCapabilities={mediaCapabilities}
            planTier={provider.planTier}
          />
        </div>
        <ProviderBookingsPanel initialBookings={providerBookings} />
        <ProviderPayoutsPanel initialBalance={payoutBalance} initialPayouts={providerPayouts} />
        <ProviderPlanPanel planTier={provider.planTier} initialRequest={planUpgradeRequest} />
        <ProviderLeadsPanel initialLeads={leads} />
      </Shell>
    );
  } catch (error) {
    if (error instanceof ProviderApiError && error.status === 401) {
      redirect('/api/auth/refresh?returnTo=%2Fprovider');
    }
    if (error instanceof ProviderApiError && error.code === 'NOT_A_PROVIDER') {
      // Embeds the same registration form `/list-your-space` uses,
      // right here — the owner's explicit fix for "doldur sonra ordan
      // ora keç, burdan ora keç": whether someone arrives at /provider
      // directly or via the marketing page, filling this in redirects
      // (ListYourSpaceForm's own router.refresh()+push) straight back
      // into the full dashboard below, no extra hop either way.
      // NextIntlClientProvider is needed only here — the rest of this
      // route hardcodes Azerbaijani copy directly (see ProviderLayout's
      // comment: provider-dashboard i18n isn't set up yet).
      return (
        <Shell>
          <h1 className="font-display text-h2 text-text-primary">Provider paneli</h1>
          <p className="text-body text-text-secondary">
            Başlamaq üçün biznesiniz haqqında qısa məlumat verin — göndərdikdən dərhal sonra öz panelinizə
            keçəcəksiniz.
          </p>
          <NextIntlClientProvider locale="az" messages={azMessages}>
            <ListYourSpaceForm />
          </NextIntlClientProvider>
        </Shell>
      );
    }
    if (error instanceof ProviderApiError && [401, 403].includes(error.status)) {
      return (
        <Shell>
          <h1 className="font-display text-h2 text-text-primary">Provider paneli</h1>
          <p className="text-body text-error">
            {error.status === 401
              ? 'Sessiyanız başa çatıb. Zəhmət olmasa yenidən daxil olun.'
              : 'Bu bölməyə giriş icazəniz yoxdur.'}
          </p>
          {error.status === 401 && (
            <Link
              href={`/az/login?redirect=${encodeURIComponent('/provider')}`}
              className="self-start rounded-md bg-accent px-5 py-3 text-label text-accent-on transition-colors hover:bg-accent-hover"
            >
              Yenidən daxil ol
            </Link>
          )}
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="font-display text-h2 text-text-primary">{azMessages.provider.title}</h1>
        <p className="text-body text-error">
          {error instanceof Error && error.message === 'PROVIDER_DATA_LOAD_FAILED'
            ? azMessages.provider.dataLoadFailed
            : azMessages.provider.backendUnavailable}
        </p>
        <Link href="/provider" className="self-start rounded-md bg-accent px-5 py-3 text-label text-accent-on">
          {azMessages.provider.retry}
        </Link>
      </Shell>
    );
  }
}
