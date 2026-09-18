import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Link } from '@/lib/i18n/navigation';
import { readSession } from '@/lib/auth/session';
import { listMyPayments } from '@/lib/api-client/payments';
import { getRoomDetail, type RoomDetail } from '@/lib/api-client/rooms';
import { PaymentHistoryItem } from '@/components/features/account/PaymentHistoryItem';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.paymentHistory' });
  return { title: t('pageTitle') };
}

/**
 * `/account/payment-history` — 06_INFORMATION_ARCHITECTURE.md §6.1, the
 * fifth `/account/*` sub-page. SSR via the BFF cookie, same pattern as
 * the other four. Read-only (no BFF route needed — unlike
 * `/account/reviews`, there's no write action here).
 *
 * Investigated before building, per the continuation go-ahead's explicit
 * "do not implement merely because documented, verify the actual
 * database/backend support" instruction: `payment`/`payment_transaction`/
 * `refund` (28_DATABASE_DDL.sql §6) turned out to be a real, complete
 * data model — the gap was a missing backend *endpoint*
 * (`PaymentsController` had zero `GET` routes), not missing *data*, so
 * `GET /account/payments` was built this pass rather than this page
 * being documented as blocked. See `PHASE4_REPORT.md`'s
 * "`/account/payment-history`" section for the full investigation.
 */
export default async function AccountPaymentHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account.paymentHistory');

  const { accessToken } = readSession(await cookies());
  let payments: Awaited<ReturnType<typeof listMyPayments>> = [];
  let loadError = false;
  if (accessToken) {
    try {
      payments = await listMyPayments(accessToken);
    } catch {
      loadError = true;
    }
  }

  const distinctRoomIds = Array.from(
    new Set(payments.map((p) => p.roomId).filter((id): id is string => Boolean(id))),
  );
  const roomEntries = await Promise.allSettled(distinctRoomIds.map((id) => getRoomDetail(id)));
  const roomsById = new Map<string, RoomDetail>();
  roomEntries.forEach((entry, index) => {
    if (entry.status === 'fulfilled') roomsById.set(distinctRoomIds[index], entry.value);
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-text-primary">{t('pageTitle')}</h1>

      {loadError && <Alert variant="error">{t('loadErrorMessage')}</Alert>}

      {!loadError && payments.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-label font-semibold text-text-primary">{t('emptyTitle')}</p>
          <p className="text-small text-text-secondary">{t('emptyMessage')}</p>
          <Link href="/search" className="mt-2 text-small font-semibold text-primary underline underline-offset-2">
            {t('emptyCta')}
          </Link>
        </div>
      )}

      {!loadError && payments.length > 0 && (
        <div className="flex flex-col gap-3">
          {payments.map((payment) => (
            <PaymentHistoryItem
              key={payment.id}
              payment={payment}
              room={payment.roomId ? (roomsById.get(payment.roomId) ?? null) : null}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
