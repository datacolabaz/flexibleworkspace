import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { readSession } from '@/lib/auth/session';
import { getMyProvider, ProviderApiError } from '@/lib/api-client/provider-dashboard';
import { listMyLeads } from '@/lib/api-client/leads';
import { listMyLocations, listMyRooms, listRoomTypes } from '@/lib/api-client/provider-rooms';
import { ProviderVerificationPanel } from '@/components/features/provider/ProviderVerificationPanel';
import { ProviderLeadsPanel } from '@/components/features/provider/ProviderLeadsPanel';
import { ProviderRoomsPanel } from '@/components/features/provider/ProviderRoomsPanel';

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
    return (
      <Shell>
        <ProviderVerificationPanel initialProvider={provider} />
        <ProviderRoomsPanel initialLocations={locations} initialRooms={rooms} roomTypes={roomTypes} />
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
