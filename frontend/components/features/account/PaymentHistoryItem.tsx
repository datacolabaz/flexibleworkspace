import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format/money';
import type { PaymentHistoryEntry } from '@/lib/api-client/payments';
import type { RoomDetail } from '@/lib/api-client/rooms';

export interface PaymentHistoryItemProps {
  payment: PaymentHistoryEntry;
  /** The room `payment.roomId` resolves to, or `null` when the lookup
   * failed (room deleted, or the batch fetch errored for this one) —
   * same "resolve to null, render a fallback" contract `BookingListItem`
   * already uses for `/account/bookings`. */
  room: RoomDetail | null;
  locale: string;
}

// Same payment_status enum PaymentsController/PaymentsService share
// (13_PAYMENT_ARCHITECTURE.md §13.3's state machine) — mapped to the
// same success/warning/error/neutral semantic set BookingListItem's own
// STATUS_VARIANT already establishes for booking status, so a payment
// row reads with the same color language as a booking row.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  CAPTURED: 'success',
  AUTHORIZED: 'warning',
  INITIATED: 'neutral',
  REFUND_PENDING: 'warning',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'neutral',
  FAILED: 'error',
  CANCELLED: 'neutral',
  CHARGEBACK: 'error',
};

/**
 * One row of `/account/payment-history` — a Server Component (no
 * interactivity: this is a read-only ledger, unlike `/account/reviews`'s
 * write flow). One row per checkout attempt (`PaymentsService
 * .listForCustomer`'s own doc comment: a booking with a failed-then-
 * retried payment shows both attempts), with any refund against that
 * booking listed underneath.
 */
export async function PaymentHistoryItem({ payment, room, locale }: PaymentHistoryItemProps) {
  const t = await getTranslations('account.paymentHistory');
  const status = payment.status ?? 'INITIATED';

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const createdLabel = payment.createdAt ? dateFormatter.format(new Date(payment.createdAt)) : undefined;

  const amountLabel =
    payment.bookingTotalAmount !== undefined && payment.bookingCurrency
      ? formatMoney(payment.bookingTotalAmount, payment.bookingCurrency, locale)
      : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {room ? (
          <Link href={`/rooms/${room.id}`} className="truncate text-label font-semibold text-text-primary hover:underline">
            {room.name}
          </Link>
        ) : (
          <span className="truncate text-label font-semibold text-text-muted">{t('roomUnavailable')}</span>
        )}
        <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{t(`statusLabel.${status}`)}</Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {createdLabel && <span className="text-small text-text-secondary">{createdLabel}</span>}
        {amountLabel && <span className="text-label font-semibold text-text-primary">{amountLabel}</span>}
      </div>

      {(payment.refunds?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-col gap-1 border-t border-border pt-2">
          {payment.refunds!.map((refund) => {
            const refundLabel =
              refund.amount !== undefined && refund.currency
                ? formatMoney(refund.amount, refund.currency, locale)
                : undefined;
            const refundDate = refund.createdAt ? dateFormatter.format(new Date(refund.createdAt)) : undefined;
            return (
              <p key={refund.id} className="text-small text-text-secondary">
                {t('refundLine', { amount: refundLabel ?? '', status: t(`refundStatusLabel.${refund.status ?? 'REQUESTED'}`), date: refundDate ?? '' })}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
