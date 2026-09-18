/** Mirrors payment_adapter (28_DATABASE_DDL.sql). */
export enum PaymentAdapterName {
  EPOINT = 'EPOINT',
  PAYRIFF = 'PAYRIFF',
  STRIPE = 'STRIPE',
}

/** Mirrors payment_status. */
export enum PaymentStatus {
  INITIATED = 'INITIATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUND_PENDING = 'REFUND_PENDING',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  CHARGEBACK = 'CHARGEBACK',
}

/** Mirrors payment_transaction_type. */
export enum PaymentTransactionType {
  CHARGE = 'CHARGE',
  REFUND = 'REFUND',
}

/** Mirrors payment_transaction_status. */
export enum PaymentTransactionStatus {
  INITIATED = 'INITIATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Mirrors refund_status. */
export enum RefundStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

/** Mirrors ledger_entry_type — includes PARTNER_COMMISSION (ADR-010 / 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.5). */
export enum LedgerEntryType {
  GROSS = 'GROSS',
  PLATFORM_FEE = 'PLATFORM_FEE',
  PROVIDER_NET = 'PROVIDER_NET',
  PROCESSING_FEE = 'PROCESSING_FEE',
  TAX = 'TAX',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
  PARTNER_COMMISSION = 'PARTNER_COMMISSION',
}

/** Mirrors commission_rule_scope. Resolution priority: PROVIDER > PROMOTIONAL(time-boxed) > CATEGORY > PLATFORM_DEFAULT (13_PAYMENT_ARCHITECTURE.md §13.5). */
export enum CommissionRuleScope {
  PLATFORM_DEFAULT = 'PLATFORM_DEFAULT',
  CATEGORY = 'CATEGORY',
  PROVIDER = 'PROVIDER',
  PROMOTIONAL = 'PROMOTIONAL',
}

/** Mirrors partner_commission_type (31_PARTNER_REFERRAL_ARCHITECTURE.md §31.2). */
export enum PartnerCommissionType {
  PERCENTAGE_OF_PLATFORM_FEE = 'PERCENTAGE_OF_PLATFORM_FEE',
  FIXED_PER_BOOKING = 'FIXED_PER_BOOKING',
}

/**
 * Gateway processing fee passed through transparently (14_PAYOUT_LEDGER.md
 * §14.2's PROCESSING_FEE entry: "Epoint's 3% card fee, passed through
 * transparently"). §13.4 documents Epoint at 3% cards / 3.5% Apple/Google
 * Pay — no published Payriff rate was found, so Payriff falls back to the
 * same published Epoint card rate as the closest documented reference
 * point pending Payriff's own published fee schedule (REQUIRES USER ACTION
 * to confirm before Payriff is used as anything but the secondary/backup
 * option §13.4 already scopes it as).
 */
export const GATEWAY_PROCESSING_FEE_PERCENTAGE: Record<
  PaymentAdapterName,
  number
> = {
  [PaymentAdapterName.EPOINT]: 3.0,
  [PaymentAdapterName.PAYRIFF]: 3.0,
  [PaymentAdapterName.STRIPE]: 2.9, // not usable for AZ today (§13.4) — placeholder for the future EU-entity adapter
};
