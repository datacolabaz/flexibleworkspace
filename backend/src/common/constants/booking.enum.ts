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
  // REQUEST_BASED flow only (Phase 1A, T1/T2) — never used by the existing
  // PAYMENT_BASED flow above, which is untouched.
  REJECTED = 'REJECTED',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  CANCELLED_BY_PROVIDER = 'CANCELLED_BY_PROVIDER',
}

/**
 * Which transition table a booking's status changes are validated against
 * (bookings.service.ts). PAYMENT_BASED is the existing, unchanged flow;
 * REQUEST_BASED is the new no-payment "request → provider accepts/rejects"
 * flow (Phase 1A). Mirrors `booking.mode` in 28_DATABASE_DDL.sql.
 */
export enum BookingMode {
  REQUEST_BASED = 'REQUEST_BASED',
  PAYMENT_BASED = 'PAYMENT_BASED',
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
  // REQUEST_BASED-only statuses: no edges here because this table only
  // governs the PAYMENT_BASED flow, which never reaches them. Their real
  // transition rules live in REQUEST_BASED_TRANSITIONS (T2).
  [BookingStatus.REJECTED]: [],
  [BookingStatus.CANCELLED_BY_USER]: [],
  [BookingStatus.CANCELLED_BY_PROVIDER]: [],
};

/** Non-terminal statuses that hold a slot / count toward the exclusion constraint. */
export const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];
