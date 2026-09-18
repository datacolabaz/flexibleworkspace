import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerEntryType } from '../../../common/constants/payment.enum';

/**
 * Maps to `ledger_entry` (28_DATABASE_DDL.sql §7, amended by
 * 32_PARTNER_REFERRAL_DDL.sql / ADR-010). Append-only — no updated_at, no
 * deleted_at (14_PAYOUT_LEDGER.md §14.2), and this service layer never
 * issues an UPDATE or DELETE against this table; a correction is always a
 * new offsetting row (REFUND/ADJUSTMENT).
 *
 * Exactly one of `providerId` / `partnerId` is set on every row — enforced
 * by the DB's `chk_ledger_entry_payee_exclusive` CHECK constraint (ADR-010).
 * A provider-payee row NEVER has `partnerId` set, and vice versa.
 */
@Entity({ name: 'ledger_entry' })
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId: string | null;

  @Column({ name: 'entry_type', type: 'enum', enum: LedgerEntryType })
  entryType: LedgerEntryType;

  /** Signed: positive = credit, negative = debit (§14.2). */
  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ name: 'payout_id', type: 'uuid', nullable: true })
  payoutId: string | null;

  @Column({ name: 'commission_rule_id', type: 'uuid', nullable: true })
  commissionRuleId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
