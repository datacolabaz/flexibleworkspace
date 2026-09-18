import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  PayoutMethod,
  PayoutStatus,
} from '../../../common/constants/payout.enum';

/**
 * Maps to `payout` (28_DATABASE_DDL.sql §7, amended by
 * 32_PARTNER_REFERRAL_DDL.sql for the nullable partnerId column — ADR-010 /
 * 14_PAYOUT_LEDGER.md §14.5a: "payout_status and payout_method are reused
 * unchanged" for partner payouts, keyed by partnerId instead of providerId.
 * Exactly one of providerId/partnerId is set on every row — enforced by the
 * DB's `chk_payout_payee_exclusive` CHECK constraint, mirroring
 * LedgerEntryEntity.
 */
@Entity({ name: 'payout' })
export class PayoutEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId: string | null;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  /** Informational: sum of just the PROVIDER_NET/PARTNER_COMMISSION ("earned") entries in this batch, before REFUND/ADJUSTMENT offsets — `amount` below is the actual payable total. */
  @Column({ name: 'gross_ledger_total', type: 'bigint' })
  grossLedgerTotal: string;

  /** The actual amount being paid out — signed sum of every ledger_entry batched into this payout. */
  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({
    name: 'payout_method',
    type: 'enum',
    enum: PayoutMethod,
    default: PayoutMethod.BANK_TRANSFER,
  })
  payoutMethod: PayoutMethod;

  @Column({
    name: 'bank_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  bankReference: string | null;

  @Column({ name: 'initiated_by_user_id', type: 'uuid', nullable: true })
  initiatedByUserId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
