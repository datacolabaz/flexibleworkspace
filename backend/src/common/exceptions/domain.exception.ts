import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for all business-rule errors in the system. Every domain
 * exception carries a machine-readable `code` the frontend maps to a
 * localized message (11_API_CONTRACTS.md §11.2 — the API error envelope is
 * locale-agnostic; localization happens client-side per 20_I18N.md §20.5).
 *
 * Never throw a raw Error or a generic HttpException for an expected
 * business-rule failure (slot unavailable, plan limit reached, booking not
 * eligible for review, etc.) — throw a DomainException subclass so the
 * global exception filter can render the consistent envelope this whole API
 * promises.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export class SlotUnavailableException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super(
      'SLOT_UNAVAILABLE',
      'This time slot is no longer available. Please choose another time.',
      HttpStatus.CONFLICT,
      details,
    );
  }
}

export class PlanLimitReachedException extends DomainException {
  constructor(limitName: string, details?: Record<string, unknown>) {
    super(
      'PLAN_LIMIT_REACHED',
      `Your current plan does not allow more ${limitName}. Upgrade your plan to continue.`,
      HttpStatus.PAYMENT_REQUIRED,
      details,
    );
  }
}

export class NotEligibleForReviewException extends DomainException {
  constructor() {
    super(
      'NOT_ELIGIBLE_FOR_REVIEW',
      'This booking is not eligible for a review yet.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class InvalidWebhookSignatureException extends DomainException {
  constructor(provider: string) {
    super(
      'INVALID_WEBHOOK_SIGNATURE',
      `Webhook signature verification failed for provider ${provider}.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InsufficientPermissionException extends DomainException {
  constructor() {
    super(
      'INSUFFICIENT_PERMISSION',
      'You do not have permission to perform this action.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found.`, HttpStatus.NOT_FOUND);
  }
}

export class InvalidBookingStateTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(
      'INVALID_STATE_TRANSITION',
      `Cannot transition booking from ${from} to ${to}.`,
      HttpStatus.CONFLICT,
      { from, to },
    );
  }
}

/** T4 — a non-VERIFIED provider (PENDING/REJECTED/SUSPENDED) may not accept or reject a booking. */
export class ProviderSuspendedException extends DomainException {
  constructor() {
    super(
      'PROVIDER_NOT_VERIFIED',
      'Your provider account is not currently verified. Contact support for assistance.',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** T4 — an action that only makes sense for one booking.mode was attempted on the other. */
export class BookingModeNotSupportedException extends DomainException {
  constructor(action: 'accept' | 'reject' | 'payment') {
    super(
      'BOOKING_MODE_NOT_SUPPORTED',
      `This booking's mode does not support the "${action}" action.`,
      HttpStatus.BAD_REQUEST,
      { action },
    );
  }
}
