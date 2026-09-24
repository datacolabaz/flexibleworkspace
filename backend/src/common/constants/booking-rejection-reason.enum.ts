/**
 * T4 (Phase 1A — Request-Based Booking, provider accept/reject) — why a
 * provider rejected a PENDING REQUEST_BASED booking. Shown back to the
 * customer via a notification (BookingsService.notifyCustomer), so this is
 * a closed set of customer-facing reasons rather than free text; OTHER
 * carries a required note (reject-booking.dto.ts) for anything this list
 * doesn't cover.
 */
export enum BookingRejectionReason {
  ROOM_UNAVAILABLE = 'ROOM_UNAVAILABLE',
  SCHEDULE_CONFLICT = 'SCHEDULE_CONFLICT',
  MAINTENANCE = 'MAINTENANCE',
  INVALID_REQUEST_DETAILS = 'INVALID_REQUEST_DETAILS',
  PRICING_ISSUE = 'PRICING_ISSUE',
  CAPACITY_MISMATCH = 'CAPACITY_MISMATCH',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  OTHER = 'OTHER',
}
