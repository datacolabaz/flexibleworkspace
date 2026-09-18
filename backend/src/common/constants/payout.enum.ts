/** Mirrors payout_status (28_DATABASE_DDL.sql). */
export enum PayoutStatus {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

/** Mirrors payout_method (28_DATABASE_DDL.sql). */
export enum PayoutMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  PROVIDER_SPLIT = 'PROVIDER_SPLIT',
}

/**
 * 14_PAYOUT_LEDGER.md §14.3's state diagram, made precise. The prose table
 * (source of truth over the ASCII diagram, which draws an ambiguous
 * PENDING/PAID -> FAILED arrow that doesn't match its own row
 * descriptions) is implemented as follows:
 *   - PENDING -> AVAILABLE exists for schema completeness, but
 *     PayoutsService.runPayoutBatch() never actually persists a row as
 *     PENDING — §14.5 step 1 says a batch is created "status = PENDING ->
 *     immediately AVAILABLE once aggregated, since eligibility was already
 *     checked at the entry level," so rows are created directly as
 *     AVAILABLE. This edge exists only so the enum's full state space is
 *     representable.
 *   - AVAILABLE -> PROCESSING: admin/finance initiates the bank transfer.
 *   - PROCESSING -> PAID: bank transfer confirmed.
 *   - PROCESSING -> FAILED: bank rejection / wrong details (the row
 *     description's actual FAILED scenario).
 *   - FAILED -> PROCESSING: corrected details, retried.
 *   - PAID -> REVERSED: a late clawback after settlement (the row
 *     description's actual REVERSED scenario) — never PAID -> FAILED,
 *     which the row descriptions never describe happening.
 */
export const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [PayoutStatus.AVAILABLE],
  [PayoutStatus.AVAILABLE]: [PayoutStatus.PROCESSING],
  [PayoutStatus.PROCESSING]: [PayoutStatus.PAID, PayoutStatus.FAILED],
  [PayoutStatus.PAID]: [PayoutStatus.REVERSED],
  [PayoutStatus.FAILED]: [PayoutStatus.PROCESSING],
  [PayoutStatus.REVERSED]: [],
};

/** The ledger_entry_type values that represent money owed TO a payee (provider or partner) — excludes GROSS/PLATFORM_FEE/PROCESSING_FEE/TAX, which are the platform's/gateway's own shares (14_PAYOUT_LEDGER.md §14.2/§14.6). */
export const PAYEE_LEDGER_ENTRY_TYPES = [
  'PROVIDER_NET',
  'PARTNER_COMMISSION',
  'REFUND',
  'ADJUSTMENT',
] as const;
