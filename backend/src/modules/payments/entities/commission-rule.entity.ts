import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CommissionRuleScope } from '../../../common/constants/payment.enum';

/**
 * Maps to `commission_rule` (28_DATABASE_DDL.sql §7). Resolved at
 * booking-confirmation time and snapshotted onto the LedgerEntry via
 * `commission_rule_id` — a later change to this table never retroactively
 * changes historical ledger entries (13_PAYMENT_ARCHITECTURE.md §13.5).
 */
@Entity({ name: 'commission_rule' })
export class CommissionRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CommissionRuleScope })
  scope: CommissionRuleScope;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'room_type_id', type: 'uuid', nullable: true })
  roomTypeId: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage: string | null;

  @Column({ name: 'fixed_fee_amount', type: 'bigint', nullable: true })
  fixedFeeAmount: string | null;

  @Column({
    name: 'fixed_fee_currency',
    type: 'char',
    length: 3,
    nullable: true,
  })
  fixedFeeCurrency: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
