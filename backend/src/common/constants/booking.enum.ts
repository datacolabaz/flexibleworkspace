/** Mirrors booking_status in 28_DATABASE_DDL.sql exactly. */
export enum BookingStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  NO_SHOW = 'NO_SHOW',
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
}

/**
 * The booking state machine (12_RESERVATION_ENGINE.md §12.3), enforced
 * explicitly rather than scattered if-checks. An edge NOT listed here is an
 * illegal transition and throws InvalidBookingStateTransitionException.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.DRAFT]: [BookingStatus.PENDING],
  [BookingStatus.PENDING]: [
    BookingStatus.PAYMENT_PENDING,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PAYMENT_PENDING]: [
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUND_PENDING],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.NO_SHOW]: [],
  [BookingStatus.REFUND_PENDING]: [BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]: [],
};

/** Non-terminal statuses that hold a slot / count toward the exclusion constraint. */
export const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];
